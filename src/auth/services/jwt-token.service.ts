import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '../../config/config.service';
import { v4 as uuidv4 } from 'uuid';
import {
  JwtPayload,
  VerifiedJwtPayload,
  DecodedJwtPayload,
  GenerateTokenPayload,
  TokenPair,
  TokenErrorType,
  TokenVerificationError,
  UserRole,
} from '../types/jwt-types';

/**
 * Production-Grade JWT Token Service
 * 
 * Features:
 * - RS256 asymmetric signing for distributed verification
 * - Standard JWT claims (sub, email, role, jti, exp, iat)
 * - Strongly typed role-based access control
 * - Comprehensive token verification with structured error logging
 * - JTI (JWT ID) for session tracking and token revocation
 * - Configurable expiration times via jsonwebtoken library
 */
@Injectable()
export class JwtTokenService {
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly accessTokenExpirySeconds: number;
  private readonly refreshTokenExpirySeconds: number;
  private readonly logger = new Logger(JwtTokenService.name);

  constructor(private configService: ConfigService) {
    this.privateKey = this.configService.getJwtPrivateKey();
    this.publicKey = this.configService.getJwtPublicKey();
    
    // Configuration in seconds for jsonwebtoken expiresIn parameter
    this.accessTokenExpirySeconds = this.configService.getNumber('JWT_ACCESS_TOKEN_EXPIRY', 300); // 5 min
    this.refreshTokenExpirySeconds = this.configService.getNumber('JWT_REFRESH_TOKEN_EXPIRY', 600); // 10 min

    if (!this.privateKey || !this.publicKey) {
      throw new Error('JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be configured');
    }
  }

  /**
   * Generate a pair of access and refresh tokens using asymmetric RS256 signing
   * 
   * Uses jsonwebtoken's expiresIn parameter to automatically set exp claim
   * JTI (JWT ID) is generated for each token for tracking and revocation
   * 
   * @param payload - Must include sub (client ID), email, and role
   * @returns TokenPair with signed access and refresh tokens
   * @throws Error if payload is missing required fields
   */
  generateTokenPair(payload: GenerateTokenPayload): TokenPair {
    // Validate required fields
    if (!payload.sub || !payload.email || !payload.role) {
      this.logger.error('Invalid payload for token generation', {
        hasSub: !!payload.sub,
        hasEmail: !!payload.email,
        hasRole: !!payload.role,
      });
      throw new Error('Token payload must include sub (client ID), email, and role');
    }

    // Validate role is a recognized enum value
    if (!Object.values(UserRole).includes(payload.role)) {
      this.logger.error(`Invalid role provided: ${payload.role}`);
      throw new Error(`Invalid role: ${payload.role}. Must be one of: ${Object.values(UserRole).join(', ')}`);
    }

    const accessTokenJti = uuidv4();
    const refreshTokenJti = uuidv4();

    try {
      // Access token payload - no manual iat/exp, let jsonwebtoken library generate them
      const accessTokenPayload: JwtPayload = {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        jti: accessTokenJti,
        iss: 'agents-of-leap', // Issuer
        aud: 'trading-middleware', // Audience
      };

      // Refresh token payload - same structure, different JTI
      const refreshTokenPayload: JwtPayload = {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        jti: refreshTokenJti,
        iss: 'agents-of-leap', // Issuer
        aud: 'trading-middleware', // Audience
      };

      // Sign with private key using RS256 algorithm (asymmetric)
      // jsonwebtoken library will automatically:
      // - Generate iat (issued at) claim with current timestamp
      // - Generate exp (expiration) claim based on expiresIn
      // - Set algorithm to RS256
      const accessToken = jwt.sign(accessTokenPayload, this.privateKey, {
        algorithm: 'RS256',
        expiresIn: this.accessTokenExpirySeconds, // Library generates exp automatically
      });

      const refreshToken = jwt.sign(refreshTokenPayload, this.privateKey, {
        algorithm: 'RS256',
        expiresIn: this.refreshTokenExpirySeconds, // Library generates exp automatically
      });

      this.logger.debug(`Tokens generated for sub: ${payload.sub}, access-jti: ${accessTokenJti}`);

      return {
        accessToken,
        refreshToken,
        accessTokenExpiresIn: this.accessTokenExpirySeconds,
        refreshTokenExpiresIn: this.refreshTokenExpirySeconds,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate token pair for sub: ${payload.sub}`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Verify token signature, expiration, and algorithm
   * 
   * SECURITY CRITICAL: This method performs full JWT verification:
   * - Validates RS256 signature using public key
   * - Checks expiration time (exp claim)
   * - Validates algorithm is RS256
   * - Ensures all required claims are present
   * 
   * @param token - The JWT token to verify
   * @returns VerifiedJwtPayload if all validations pass
   * @throws TokenVerificationError describing what failed
   */
  verifyToken(token: string): VerifiedJwtPayload {
    try {
      // jwt.verify performs:
      // - Signature validation using public key
      // - Algorithm verification (checks it's RS256)
      // - Expiration check (validates exp claim against current time)
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
        complete: false, // Return only payload, not full decoded object
      }) as any;

      // Additional validation for required claims
      if (!decoded.sub || !decoded.email || !decoded.role || !decoded.jti) {
        const errorInfo: TokenVerificationError = {
          type: TokenErrorType.MISSING_CLAIMS,
          message: `Token missing required claims. sub: ${!!decoded.sub}, email: ${!!decoded.email}, role: ${!!decoded.role}, jti: ${!!decoded.jti}`,
          timestamp: new Date(),
        };
        this.logger.warn(`Token verification failed: ${errorInfo.message}`);
        throw new Error(errorInfo.message);
      }

      // Validate role is a recognized enum value
      if (!Object.values(UserRole).includes(decoded.role)) {
        const errorInfo: TokenVerificationError = {
          type: TokenErrorType.INVALID_CLAIMS,
          message: `Invalid role in token: ${decoded.role}`,
          timestamp: new Date(),
          tokenJti: decoded.jti,
        };
        this.logger.warn(`Token verification failed: ${errorInfo.message}`);
        throw new Error(errorInfo.message);
      }

      this.logger.debug(`Token verified successfully, sub: ${decoded.sub}, jti: ${decoded.jti}`);

      // Return fully verified payload
      return decoded as VerifiedJwtPayload;
    } catch (error) {
      // Categorize the error and log structured error information
      const verificationError = this.categorizeTokenError(error, token);
      this.logger.warn(
        `Token verification failed: [${verificationError.type}] ${verificationError.message}`,
        { timestamp: verificationError.timestamp.toISOString() },
      );
      throw verificationError;
    }
  }

  /**
   * Decode token WITHOUT verification
   * 
   * SECURITY WARNING: This method does NOT validate the token signature, expiration, or algorithm.
   * Use ONLY for:
   * - Debugging and inspection purposes
   * - Extracting JTI before attempting verification (to log which token failed)
   * - Administrative inspection of token structure
   * 
   * NEVER use decoded tokens for security decisions such as:
   * - Authorization checks
   * - Permission validation
   * - Session tracking
   * - Token revocation decisions
   * 
   * @param token - The JWT token to decode
   * @returns DecodedJwtPayload (unverified) or null if token is malformed
   */
  decodeToken(token: string): DecodedJwtPayload | null {
    try {
      // jwt.decode does NOT verify anything - it just extracts and parses the payload
      const decoded = jwt.decode(token) as DecodedJwtPayload | null;
      
      if (decoded) {
        this.logger.debug(
          `Token decoded for inspection (UNVERIFIED), jti: ${(decoded as any)?.jti || 'unknown'}`,
        );
      }
      
      return decoded;
    } catch (error) {
      this.logger.debug(
        `Failed to decode token: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Check if token is expired (for debugging only)
   * 
   * NOTE: This decodes without verification and is for informational purposes.
   * For security decisions, use verifyToken() which performs full validation.
   * 
   * @param token - The JWT token to check
   * @returns true if token is expired or malformed, false otherwise
   */
  isTokenExpired(token: string): boolean {
    const payload = this.decodeToken(token);
    if (!payload || !payload.exp) {
      return true;
    }
    const now = Math.floor(Date.now() / 1000);
    return (payload.exp as number) < now;
  }

  /**
   * Get time remaining until token expiration (in seconds)
   * 
   * NOTE: This decodes without verification and is for informational purposes.
   * For security decisions, use verifyToken() which performs full validation.
   * 
   * @param token - The JWT token to check
   * @returns Seconds until expiration, or 0 if already expired or malformed
   */
  getTimeUntilExpiration(token: string): number {
    const payload = this.decodeToken(token);
    if (!payload || !payload.exp) {
      return 0;
    }
    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = (payload.exp as number) - now;
    return Math.max(0, timeRemaining);
  }

  /**
   * Extract JTI from token (for logging and tracking)
   * 
   * NOTE: This decodes without verification. Use to extract JTI for logging purposes.
   * Always verify the token separately before making security decisions.
   * 
   * @param token - The JWT token
   * @returns JTI string if present, undefined otherwise
   */
  extractJti(token: string): string | undefined {
    const payload = this.decodeToken(token);
    return (payload as any)?.jti as string | undefined;
  }

  /**
   * Categorize token verification errors
   * 
   * Maps jwt verification exceptions to structured error types for better observability
   * 
   * @private
   */
  private categorizeTokenError(error: any, token: string): TokenVerificationError {
    const baseError: TokenVerificationError = {
      type: TokenErrorType.UNKNOWN,
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date(),
      tokenJti: this.extractJti(token),
    };

    if (error instanceof jwt.TokenExpiredError) {
      return {
        ...baseError,
        type: TokenErrorType.EXPIRED,
        message: `Token expired at ${error.expiredAt?.toISOString() || 'unknown time'}`,
      };
    }

    if (error instanceof jwt.JsonWebTokenError) {
      const message = error.message.toLowerCase();
      
      if (message.includes('invalid signature')) {
        return {
          ...baseError,
          type: TokenErrorType.INVALID_SIGNATURE,
          message: 'Token signature verification failed',
        };
      }

      if (message.includes('invalid algorithm')) {
        return {
          ...baseError,
          type: TokenErrorType.INVALID_ALGORITHM,
          message: 'Token algorithm is not RS256',
        };
      }

      if (message.includes('malformed') || message.includes('invalid token')) {
        return {
          ...baseError,
          type: TokenErrorType.MALFORMED,
          message: 'Token is malformed and cannot be decoded',
        };
      }
    }

    return baseError;
  }
}
