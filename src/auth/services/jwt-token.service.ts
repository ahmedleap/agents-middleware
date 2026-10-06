import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '../../config/config.service';
import { v4 as uuidv4 } from 'uuid';

export interface TokenPayload {
  clientId: string;
  email: string;
  role?: string;
  jti?: string; // JWT ID for tracking
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

@Injectable()
export class JwtTokenService {
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly accessTokenExpiry: number;
  private readonly refreshTokenExpiry: number;

  constructor(private configService: ConfigService) {
    this.privateKey = this.configService.getJwtPrivateKey();
    this.publicKey = this.configService.getJwtPublicKey();
    this.accessTokenExpiry = this.configService.getNumber('JWT_ACCESS_TOKEN_EXPIRY', 300); // 5 min
    this.refreshTokenExpiry = this.configService.getNumber('JWT_REFRESH_TOKEN_EXPIRY', 600); // 10 min

    if (!this.privateKey || !this.publicKey) {
      throw new Error('JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be configured');
    }
  }

  /**
   * Generate a pair of access and refresh tokens using asymmetric RSA signing
   */
  generateTokenPair(payload: Omit<TokenPayload, 'iat' | 'exp' | 'jti'>): TokenPair {
    const now = Math.floor(Date.now() / 1000);
    const accessTokenJti = uuidv4();
    const refreshTokenJti = uuidv4();

    const accessTokenPayload: TokenPayload = {
      ...payload,
      jti: accessTokenJti,
      iat: now,
      exp: now + this.accessTokenExpiry,
    };

    const refreshTokenPayload: TokenPayload = {
      ...payload,
      jti: refreshTokenJti,
      iat: now,
      exp: now + this.refreshTokenExpiry,
    };

    // Sign with private key using RS256 algorithm (asymmetric)
    const accessToken = jwt.sign(accessTokenPayload, this.privateKey, {
      algorithm: 'RS256',
      noTimestamp: false,
    });

    const refreshToken = jwt.sign(refreshTokenPayload, this.privateKey, {
      algorithm: 'RS256',
      noTimestamp: false,
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.accessTokenExpiry,
      refreshTokenExpiresIn: this.refreshTokenExpiry,
    };
  }

  /**
   * Verify and decode a token using the public key
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
      }) as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Decode token without verification (for inspection)
   */
  decodeToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.decode(token) as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    const payload = this.decodeToken(token);
    if (!payload || !payload.exp) {
      return true;
    }
    return payload.exp < Math.floor(Date.now() / 1000);
  }

  /**
   * Get time remaining until token expiration (in seconds)
   */
  getTimeUntilExpiration(token: string): number {
    const payload = this.decodeToken(token);
    if (!payload || !payload.exp) {
      return 0;
    }
    const timeRemaining = payload.exp - Math.floor(Date.now() / 1000);
    return Math.max(0, timeRemaining);
  }
}
