import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '../../config/config.service';

export interface TokenPayload {
  clientId: string;
  email: string;
  role?: string;
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
  private readonly jwtSecret: string;
  private readonly accessTokenExpiry: number;
  private readonly refreshTokenExpiry: number;

  constructor(private configService: ConfigService) {
    this.jwtSecret = this.configService.get('JWT_SECRET');
    this.accessTokenExpiry = this.configService.getNumber('JWT_ACCESS_TOKEN_EXPIRY', 900); // 15 min
    this.refreshTokenExpiry = this.configService.getNumber('JWT_REFRESH_TOKEN_EXPIRY', 900); // 15 min

    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }
  }

  /**
   * Generate a pair of access and refresh tokens
   */
  generateTokenPair(payload: Omit<TokenPayload, 'iat' | 'exp'>): TokenPair {
    const now = Math.floor(Date.now() / 1000);
    const accessTokenPayload: TokenPayload = {
      ...payload,
      iat: now,
      exp: now + this.accessTokenExpiry,
    };

    const refreshTokenPayload: TokenPayload = {
      ...payload,
      iat: now,
      exp: now + this.refreshTokenExpiry,
    };

    const accessToken = jwt.sign(accessTokenPayload, this.jwtSecret);
    const refreshToken = jwt.sign(refreshTokenPayload, this.jwtSecret);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.accessTokenExpiry,
      refreshTokenExpiresIn: this.refreshTokenExpiry,
    };
  }

  /**
   * Verify and decode a token
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
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
