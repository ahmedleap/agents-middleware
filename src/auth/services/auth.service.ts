import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { JwtTokenService, TokenPair } from './jwt-token.service';
import { RateLimitService } from './rate-limit.service';
import { BackendIntegrationService } from './backend-integration.service';

export interface AuthLoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    clientId: string;
    email: string;
    firstName: string;
    lastName: string;
    role?: string;
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private blacklistedTokens: Set<string> = new Set();

  constructor(
    private jwtTokenService: JwtTokenService,
    private rateLimitService: RateLimitService,
    private backendIntegrationService: BackendIntegrationService,
  ) {}

  /**
   * Add token to blacklist (for logout)
   */
  private blacklistToken(token: string): void {
    this.blacklistedTokens.add(token);
    // Clean up expired tokens from blacklist every 5 minutes
    setTimeout(() => {
      if (this.jwtTokenService.isTokenExpired(token)) {
        this.blacklistedTokens.delete(token);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Check if token is blacklisted
   */
  private isTokenBlacklisted(token: string): boolean {
    return this.blacklistedTokens.has(token);
  }

  /**
   * Login user with email and password
   */
  async login(email: string, password: string): Promise<AuthLoginResponse> {
    // Check rate limiting
    if (this.rateLimitService.isLocked(email)) {
      const lockoutTimeMs = this.rateLimitService.getLockoutTimeRemaining(email);
      const lockoutTimeSec = Math.ceil(lockoutTimeMs / 1000);
      this.logger.warn(`Login attempt for locked account: ${email}`);
      throw new HttpException(
        `Account locked due to too many failed login attempts. Try again in ${lockoutTimeSec} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      // Authenticate with backend
      const backendUser = await this.backendIntegrationService.authenticateUser(email, password);

      // Clear rate limit on successful login
      this.rateLimitService.clearAttempts(email);

      // Generate token pair
      const tokenPair = this.jwtTokenService.generateTokenPair({
        clientId: backendUser.clientId,
        email: backendUser.email,
        role: backendUser.role,
      });

      this.logger.log(`User logged in successfully: ${email}`);

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.accessTokenExpiresIn,
        user: {
          clientId: backendUser.clientId,
          email: backendUser.email,
          firstName: backendUser.firstName,
          lastName: backendUser.lastName,
          role: backendUser.role,
        },
        dashboard: backendUser.accounts
          ? {
              accounts: backendUser.accounts,
              portfolioValue: backendUser.portfolioValue,
            }
          : undefined,
      };
    } catch (error) {
      // Record failed attempt
      if (!this.rateLimitService.recordFailedAttempt(email)) {
        this.logger.warn(`Account locked after failed login attempt: ${email}`);
        throw new HttpException(
          `Account locked due to too many failed login attempts. Try again in ${Math.ceil(
            this.rateLimitService.getLockoutTimeRemaining(email) / 1000,
          )} seconds.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Re-throw the error from backend
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Login failed for user: ${email}`, error instanceof Error ? error.message : error);
      throw new HttpException(
        'Login failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Refresh tokens when access token is about to expire
   * Both access and refresh tokens are renewed
   */
  async refresh(clientId: string, refreshToken: string): Promise<AuthRefreshResponse> {
    try {
      // Verify refresh token is valid
      const tokenPayload = this.jwtTokenService.verifyToken(refreshToken);
      if (!tokenPayload) {
        throw new HttpException(
          'Invalid refresh token',
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (tokenPayload.clientId !== clientId) {
        throw new HttpException(
          'Refresh token does not match client ID',
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Notify backend to update refresh token in database
      await this.backendIntegrationService.refreshToken(clientId, refreshToken);

      // Generate new token pair
      const tokenPair = this.jwtTokenService.generateTokenPair({
        clientId: tokenPayload.clientId,
        email: tokenPayload.email,
        role: tokenPayload.role,
      });

      this.logger.log(`Tokens refreshed for client: ${clientId}`);

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.accessTokenExpiresIn,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Token refresh failed for client: ${clientId}`, error instanceof Error ? error.message : error);
      throw new HttpException(
        'Token refresh failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Validate an access token
   * Also checks if token is blacklisted (from logout)
   */
  validateAccessToken(token: string): boolean {
    // Check if token is blacklisted first (faster than JWT verification)
    if (this.isTokenBlacklisted(token)) {
      this.logger.warn('Access token is blacklisted (user logged out)');
      return false;
    }
    return this.jwtTokenService.verifyToken(token) !== null;
  }

  /**
   * Logout user - invalidates both access and refresh tokens
   * 1. Blacklists access token on middleware
   * 2. Notifies backend to clear refresh token from database
   */
  async logout(clientId: string, accessToken: string, refreshToken?: string): Promise<void> {
    try {
      // Verify the access token before processing logout
      const tokenPayload = this.jwtTokenService.verifyToken(accessToken);
      if (!tokenPayload || tokenPayload.clientId !== clientId) {
        throw new HttpException(
          'Invalid access token for logout',
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Blacklist the access token to prevent further use
      this.blacklistToken(accessToken);

      // Blacklist refresh token if provided
      if (refreshToken) {
        this.blacklistToken(refreshToken);
      }

      // Notify backend to clear refresh token from database
      try {
        await this.backendIntegrationService.logout(clientId);
        this.logger.log(`User logged out successfully: ${clientId}`);
      } catch (backendError) {
        // Log but don't fail - logout can still succeed on middleware side
        this.logger.warn(
          `Failed to clear refresh token on backend for ${clientId}`,
          backendError instanceof Error ? backendError.message : 'Unknown error',
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Logout failed for client: ${clientId}`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new HttpException(
        'Logout failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
