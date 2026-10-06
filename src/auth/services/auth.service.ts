import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { JwtTokenService, TokenPair } from './jwt-token.service';
import { RateLimitService } from './rate-limit.service';
import { RefreshTokenService } from './refresh-token.service';
import { BackendIntegrationService } from './backend-integration.service';
import { ConfigService } from '../../config/config.service';
import { AuthSession } from '../entities/auth-session.entity';
import { Client } from '../entities/client.entity';
import { v4 as uuidv4 } from 'uuid';

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

export interface AuthSignupResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    clientId: string;
    email: string;
    firstName: string;
    lastName: string;
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
   * Sign up a new user
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

      // Create new client
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
      this.logger.log(`New user signed up: ${email}`);

      // Generate token pair
      const tokenPair = this.jwtTokenService.generateTokenPair({
        clientId,
        email,
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
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Signup failed for email: ${email}`, error instanceof Error ? error.message : error);
      throw new HttpException('Signup failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
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
      // Find user in local database
      const client = await this.clientRepository.findOne({
        where: { email },
      });

      if (!client) {
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
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, client.password_hash);
      if (!passwordMatch) {
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

        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }

      // Clear rate limit on successful login
      this.rateLimitService.clearAttempts(email);

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
        this.logger.warn(`Failed to get dashboard data from backend for ${email}`, backendError);
        // Don't fail login if backend is unavailable
      }

      // Generate token pair
      const tokenPair = this.jwtTokenService.generateTokenPair({
        clientId: client.client_id,
        email: client.email,
      });

      // Store refresh token in database
      await this.refreshTokenService.storeRefreshToken(
        client.client_id,
        tokenPair.refreshToken,
        tokenPair.accessToken,
        tokenPair.refreshTokenExpiresIn,
        tokenPair.accessTokenExpiresIn,
      );

      this.logger.log(`User logged in successfully: ${email}`);

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.accessTokenExpiresIn,
        user: {
          clientId: client.client_id,
          email: client.email,
          firstName: client.first_name,
          lastName: client.last_name,
        },
        dashboard,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Login failed for user: ${email}`, error instanceof Error ? error.message : error);
      throw new HttpException('Login failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Refresh tokens when access token is about to expire
   * Both access and refresh tokens are renewed
   */
  async refresh(clientId: string, refreshToken: string): Promise<AuthRefreshResponse> {
    try {
      // Verify refresh token signature
      const tokenPayload = this.jwtTokenService.verifyToken(refreshToken);
      if (!tokenPayload) {
        throw new HttpException('Invalid refresh token', HttpStatus.UNAUTHORIZED);
      }

      if (tokenPayload.clientId !== clientId) {
        throw new HttpException('Refresh token does not match client ID', HttpStatus.UNAUTHORIZED);
      }

      // Validate refresh token against database
      const session = await this.refreshTokenService.validateRefreshToken(clientId, refreshToken);
      if (!session) {
        throw new HttpException('Invalid or expired refresh token', HttpStatus.UNAUTHORIZED);
      }

      // Generate new token pair
      const tokenPair = this.jwtTokenService.generateTokenPair({
        clientId: tokenPayload.clientId,
        email: tokenPayload.email,
      });

      // Update refresh token in database
      await this.refreshTokenService.updateRefreshToken(
        session.session_id,
        tokenPair.refreshToken,
        tokenPair.accessToken,
        tokenPair.refreshTokenExpiresIn,
        tokenPair.accessTokenExpiresIn,
      );

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
      throw new HttpException('Token refresh failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Validate an access token
   */
  validateAccessToken(token: string): boolean {
    return this.jwtTokenService.verifyToken(token) !== null;
  }

  /**
   * Logout user - revokes refresh token from database
   */
  async logout(clientId: string, refreshToken: string): Promise<void> {
    try {
      // Verify the refresh token before processing logout
      const tokenPayload = this.jwtTokenService.verifyToken(refreshToken);
      if (!tokenPayload || tokenPayload.clientId !== clientId) {
        throw new HttpException('Invalid token for logout', HttpStatus.UNAUTHORIZED);
      }

      // Revoke the refresh token in database
      await this.refreshTokenService.revokeRefreshToken(clientId, refreshToken);

      this.logger.log(`User logged out successfully: ${clientId}`);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Logout failed for client: ${clientId}`, error instanceof Error ? error.message : error);
      throw new HttpException('Logout failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
