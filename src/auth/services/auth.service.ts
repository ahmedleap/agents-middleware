import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { JwtTokenService } from './jwt-token.service';
import { RateLimitService } from './rate-limit.service';
import { RefreshTokenService } from './refresh-token.service';
import { BackendIntegrationService } from './backend-integration.service';
import { ConfigService } from '../../config/config.service';
import { AuthSession } from '../entities/auth-session.entity';
import { Client } from '../entities/client.entity';
import { UserRole, VerifiedJwtPayload, TokenVerificationError, TokenErrorType } from '../types/jwt-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Updated Auth Response with strongly typed role (never optional)
 */
export interface AuthLoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    clientId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
  dashboard?: {
    accounts?: Array<{
      accountId: string;
      name: string;
      cashBalance: number;
      status: string;
    }>;
    portfolioValue?: number;
  };
}

export interface AuthRefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Updated Auth Signup Response with strongly typed role (defaults to CLIENT)
 */
export interface AuthSignupResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    clientId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly passwordMinLength: number;

  constructor(
    private jwtTokenService: JwtTokenService,
    private rateLimitService: RateLimitService,
    private refreshTokenService: RefreshTokenService,
    private backendIntegrationService: BackendIntegrationService,
    private configService: ConfigService,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
  ) {
    this.passwordMinLength = this.configService.getNumber('PASSWORD_MIN_LENGTH', 8);
  }

  /**
   * Validate password meets requirements:
   * - Minimum length (default 8)
   * - Contains uppercase
   * - Contains lowercase
   * - Contains number
   * - Contains special character
   */
  private validatePassword(password: string): { valid: boolean; error?: string } {
    if (password.length < this.passwordMinLength) {
      return { valid: false, error: `Password must be at least ${this.passwordMinLength} characters` };
    }

    if (!/[a-z]/.test(password)) {
      return { valid: false, error: 'Password must contain lowercase letter' };
    }

    if (!/[A-Z]/.test(password)) {
      return { valid: false, error: 'Password must contain uppercase letter' };
    }

    if (!/\d/.test(password)) {
      return { valid: false, error: 'Password must contain number' };
    }

    if (!/[@$!%*?&]/.test(password)) {
      return { valid: false, error: 'Password must contain special character (@$!%*?&)' };
    }

    return { valid: true };
  }

  /**
   * Sign up a new user with default CLIENT role
   * 
   * New users always receive CLIENT role.
   * ANALYST and ADMIN roles must be assigned via separate admin service.
   */
  async signup(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phoneNumber?: string,
    country?: string,
  ): Promise<AuthSignupResponse> {
    try {
      // Validate password
      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.valid) {
        throw new HttpException(passwordValidation.error!, HttpStatus.BAD_REQUEST);
      }

      // Check if email already exists
      const existingClient = await this.clientRepository.findOne({
        where: { email },
      });

      if (existingClient) {
        throw new HttpException('Email already registered', HttpStatus.CONFLICT);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create new client with default CLIENT role
      const clientId = uuidv4();
      const client = new Client();
      client.client_id = clientId;
      client.email = email;
      client.password_hash = passwordHash;
      client.first_name = firstName;
      client.last_name = lastName;
      client.phone = phoneNumber;
      client.country = country;
      client.date_of_birth = new Date(); // Placeholder - should be collected from user
      client.join_date = new Date();
      client.email_verified = false;
      client.auth_status = 'ACTIVE';
      client.failed_login_attempts = 0;

      await this.clientRepository.save(client);
      this.logger.log(`New user signed up with CLIENT role: ${email}, client_id: ${clientId}`);

      // Generate token pair with sub claim (client ID) and required role
      const tokenPair = this.jwtTokenService.generateTokenPair({
        sub: clientId,
        email,
        role: UserRole.CLIENT,
      });

      // Store refresh token in database
      await this.refreshTokenService.storeRefreshToken(
        clientId,
        tokenPair.refreshToken,
        tokenPair.accessToken,
        tokenPair.refreshTokenExpiresIn,
        tokenPair.accessTokenExpiresIn,
      );

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.accessTokenExpiresIn,
        user: {
          clientId,
          email,
          firstName,
          lastName,
          role: UserRole.CLIENT,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Signup failed for email: ${email}`, error instanceof Error ? error.message : String(error));
      throw new HttpException('Signup failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Login user with email and password
   * 
   * Enforces rate limiting:
   * - 3 failed attempts → 15-minute lockout
   * - Attempt during lockout → reset timer (no penalty)
   * - Successful login → clear attempts
   * 
   * Retrieves role from database and includes it in generated tokens.
   */
  async login(email: string, password: string): Promise<AuthLoginResponse> {
    try {
      // Check if account is currently locked out
      if (this.rateLimitService.isCurrentlyLocked(email)) {
        // Reset lockout timer on attempt during lockout (no credential check)
        this.rateLimitService.resetLockoutTimer(email);
        
        const lockoutTimeMs = this.rateLimitService.getLockoutTimeRemaining(email);
        const lockoutTimeSec = Math.ceil(lockoutTimeMs / 1000);
        
        this.logger.warn(
          `Login attempt during lockout for email: ${email}, ` +
          `lockout reset, retry in ${lockoutTimeSec}s`,
        );
        
        throw new HttpException(
          `Account locked due to too many failed login attempts. Try again in ${lockoutTimeSec} seconds.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Lockout expired (if was locked) - proceed with credential check
      
      // Find user in local database
      const client = await this.clientRepository.findOne({
        where: { email },
      });

      if (!client) {
        // Invalid username - record failed attempt
        const stillAllowed = this.rateLimitService.recordFailedAttempt(email);
        
        if (!stillAllowed) {
          // Account just locked
          const lockoutTimeSec = Math.ceil(
            this.rateLimitService.getLockoutTimeRemaining(email) / 1000,
          );
          throw new HttpException(
            `Account locked due to too many failed login attempts. Try again in ${lockoutTimeSec} seconds.`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, client.password_hash);
      if (!passwordMatch) {
        // Invalid password - record failed attempt
        const stillAllowed = this.rateLimitService.recordFailedAttempt(email);
        
        if (!stillAllowed) {
          // Account just locked
          const lockoutTimeSec = Math.ceil(
            this.rateLimitService.getLockoutTimeRemaining(email) / 1000,
          );
          throw new HttpException(
            `Account locked due to too many failed login attempts. Try again in ${lockoutTimeSec} seconds.`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }

      // Successful login - clear rate limit attempts
      this.rateLimitService.clearAttempts(email);
      this.logger.log(`Successful login for email: ${email}`);

      // All regular users (clients) have CLIENT role
      const clientRole = UserRole.CLIENT;

      // Get dashboard data from backend if available
      let dashboard;
      try {
        const backendUser = await this.backendIntegrationService.authenticateUser(email, password);
        if (backendUser.accounts) {
          dashboard = {
            accounts: backendUser.accounts,
            portfolioValue: backendUser.portfolioValue,
          };
        }
      } catch (backendError) {
        this.logger.warn(
          `Failed to get dashboard data from backend for ${email}: ` +
          `${backendError instanceof Error ? backendError.message : String(backendError)}`,
        );
        // Don't fail login if backend is unavailable
      }

      // Generate token pair with sub claim (client ID) and role from database
      const tokenPair = this.jwtTokenService.generateTokenPair({
        sub: client.client_id,
        email: client.email,
        role: clientRole,
      });

      // Store refresh token in database
      await this.refreshTokenService.storeRefreshToken(
        client.client_id,
        tokenPair.refreshToken,
        tokenPair.accessToken,
        tokenPair.refreshTokenExpiresIn,
        tokenPair.accessTokenExpiresIn,
      );

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.accessTokenExpiresIn,
        user: {
          clientId: client.client_id,
          email: client.email,
          firstName: client.first_name,
          lastName: client.last_name,
          role: clientRole,
        },
        dashboard,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Login failed for email: ${email}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
      throw new HttpException('Login failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Refresh tokens when access token is about to expire
   * 
   * Both access and refresh tokens are renewed.
   * Role from verified refresh token is preserved in new tokens.
   * Validates token signature, expiration, and database state.
   */
  async refresh(clientId: string, refreshToken: string): Promise<AuthRefreshResponse> {
    try {
      // Verify refresh token - throws TokenVerificationError on failure
      let verifiedPayload: VerifiedJwtPayload;
      try {
        verifiedPayload = this.jwtTokenService.verifyToken(refreshToken);
      } catch (verificationError) {
        if (verificationError instanceof Error) {
          const tokenError = verificationError as any as TokenVerificationError;
          if (tokenError.type === TokenErrorType.EXPIRED) {
            this.logger.warn(`Token refresh failed: refresh token expired, client: ${clientId}`);
          } else {
            this.logger.warn(`Token refresh failed: ${tokenError.type}, client: ${clientId}`);
          }
        }
        throw new HttpException('Invalid or expired refresh token', HttpStatus.UNAUTHORIZED);
      }

      // Verify sub (client ID) matches
      if (verifiedPayload.sub !== clientId) {
        this.logger.warn(
          `Token refresh failed: client ID mismatch, expected: ${clientId}, got: ${verifiedPayload.sub}`,
        );
        throw new HttpException('Refresh token does not match client ID', HttpStatus.UNAUTHORIZED);
      }

      // Validate refresh token against database (checks for revocation)
      const session = await this.refreshTokenService.validateRefreshToken(clientId, refreshToken);
      if (!session) {
        this.logger.warn(`Token refresh failed: refresh token not found or revoked in database, client: ${clientId}`);
        throw new HttpException('Invalid or expired refresh token', HttpStatus.UNAUTHORIZED);
      }

      // Generate new token pair preserving role from verified token
      const tokenPair = this.jwtTokenService.generateTokenPair({
        sub: verifiedPayload.sub,
        email: verifiedPayload.email,
        role: verifiedPayload.role,
      });

      // Update refresh token in database
      await this.refreshTokenService.updateRefreshToken(
        session.session_id,
        tokenPair.refreshToken,
        tokenPair.accessToken,
        tokenPair.refreshTokenExpiresIn,
        tokenPair.accessTokenExpiresIn,
      );

      this.logger.log(`Tokens refreshed for client: ${clientId}, role: ${verifiedPayload.role}`);

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.accessTokenExpiresIn,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Token refresh failed for client: ${clientId}`,
        error instanceof Error ? error.message : String(error),
      );
      throw new HttpException('Token refresh failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Validate an access token
   * 
   * Returns true only if token is valid (signature, expiration, algorithm all verified).
   * This method does NOT perform database checks - it's for quick validation.
   * 
   * @param token - The access token to validate
   * @returns true if token is valid and not expired
   */
  validateAccessToken(token: string): boolean {
    try {
      this.jwtTokenService.verifyToken(token);
      return true;
    } catch (error) {
      // Verification failed - token is invalid or expired
      return false;
    }
  }

  /**
   * Logout user - revokes refresh token from database
   * 
   * Verifies the refresh token before revocation to ensure the request is authentic.
   */
  async logout(clientId: string, refreshToken: string): Promise<void> {
    try {
      // Verify the refresh token before processing logout - throws on error
      let verifiedPayload: VerifiedJwtPayload;
      try {
        verifiedPayload = this.jwtTokenService.verifyToken(refreshToken);
      } catch (verificationError) {
        if (verificationError instanceof Error) {
          const tokenError = verificationError as any as TokenVerificationError;
          this.logger.warn(
            `Logout failed: token verification error, type: ${tokenError.type}, client: ${clientId}`,
          );
        }
        throw new HttpException('Invalid token for logout', HttpStatus.UNAUTHORIZED);
      }

      // Verify sub (client ID) matches
      if (verifiedPayload.sub !== clientId) {
        this.logger.warn(
          `Logout failed: client ID mismatch, expected: ${clientId}, got: ${verifiedPayload.sub}`,
        );
        throw new HttpException('Invalid token for logout', HttpStatus.UNAUTHORIZED);
      }

      // Revoke the refresh token in database
      await this.refreshTokenService.revokeRefreshToken(clientId, refreshToken);

      this.logger.log(`User logged out successfully: ${clientId}`);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Logout failed for client: ${clientId}`,
        error instanceof Error ? error.message : String(error),
      );
      throw new HttpException('Logout failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Normalize and validate role from database
   * 
   * Ensures role is a valid UserRole enum value.
   * Falls back to CLIENT if role is invalid or missing.
   * 
   * @private
   */
  private normalizeRole(role: string | undefined): UserRole | null {
    if (!role) {
      return null;
    }

    const normalizedRole = role.toUpperCase();
    if (Object.values(UserRole).includes(normalizedRole as UserRole)) {
      return normalizedRole as UserRole;
    }

    this.logger.warn(`Invalid role in database: ${role}, defaulting to CLIENT`);
    return null;
  }
}
