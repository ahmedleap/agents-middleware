import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '../../config/config.service';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  clientId: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
  // Dashboard data placeholder
  accounts?: Array<{
    accountId: string;
    name: string;
    cashBalance: number;
    status: string;
  }>;
  portfolioValue?: number;
}

export interface RefreshTokenRequest {
  clientId: string;
  refreshToken: string;
}

export interface RefreshTokenResponse {
  clientId: string;
  refreshTokenUpdated: boolean;
  newRefreshToken?: string;
}

@Injectable()
export class BackendIntegrationService {
  private axiosInstance: AxiosInstance;
  private readonly logger = new Logger(BackendIntegrationService.name);
  private readonly baseUrl: string;
  private readonly loginEndpoint: string;
  private readonly refreshEndpoint: string;
  private readonly userEndpoint: string;
  private readonly timeout: number;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get('BACKEND_BASE_URL', 'http://localhost:8080');
    this.loginEndpoint = this.configService.get('BACKEND_LOGIN_ENDPOINT', '/auth/login');
    this.refreshEndpoint = this.configService.get('BACKEND_REFRESH_ENDPOINT', '/auth/refresh');
    this.userEndpoint = this.configService.get('BACKEND_USER_ENDPOINT', '/users/{userId}');
    this.timeout = this.configService.getNumber('BACKEND_TIMEOUT_MS', 30000);

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Authenticate user with backend
   * ASSUMPTION: Backend has POST /auth/login endpoint that accepts email and password
   * and returns client details
   */
  async authenticateUser(email: string, password: string): Promise<LoginResponse> {
    try {
      this.logger.debug(`Authenticating user: ${email}`);

      const response = await this.axiosInstance.post<LoginResponse>(
        this.loginEndpoint,
        {
          email,
          password,
        },
      );

      if (!response.data.clientId) {
        throw new HttpException(
          'Invalid response from backend: missing clientId',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      this.logger.debug(`Successfully authenticated user: ${email}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Authentication failed for user: ${email}`, error instanceof Error ? error.message : error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new HttpException(
            'Invalid credentials',
            HttpStatus.UNAUTHORIZED,
          );
        }

        if (error.response?.status === 404) {
          throw new HttpException(
            'User not found',
            HttpStatus.NOT_FOUND,
          );
        }

        if (error.code === 'ECONNREFUSED') {
          throw new HttpException(
            'Backend service unavailable',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }

        throw new HttpException(
          error.response?.data?.message || 'Backend authentication failed',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException(
        'Backend authentication failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Refresh token with backend
   * ASSUMPTION: Backend has POST /auth/refresh endpoint that validates and updates refresh token
   * and returns updated refresh token
   */
  async refreshToken(clientId: string, refreshToken: string): Promise<RefreshTokenResponse> {
    try {
      this.logger.debug(`Refreshing token for client: ${clientId}`);

      const response = await this.axiosInstance.post<RefreshTokenResponse>(
        this.refreshEndpoint,
        {
          clientId,
          refreshToken,
        },
      );

      this.logger.debug(`Successfully refreshed token for client: ${clientId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Token refresh failed for client: ${clientId}`, error instanceof Error ? error.message : error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new HttpException(
            'Refresh token invalid or expired',
            HttpStatus.UNAUTHORIZED,
          );
        }

        throw new HttpException(
          error.response?.data?.message || 'Backend refresh failed',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException(
        'Backend refresh failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get additional user information from backend
   * Can be used to fetch dashboard data, permissions, etc.
   */
  async getUserInfo(clientId: string, accessToken: string): Promise<LoginResponse> {
    try {
      this.logger.debug(`Fetching user info for client: ${clientId}`);

      const url = this.userEndpoint.replace('{userId}', clientId);

      const response = await this.axiosInstance.get<LoginResponse>(
        url,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      this.logger.debug(`Successfully fetched user info for client: ${clientId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Fetching user info failed for client: ${clientId}`, error instanceof Error ? error.message : error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new HttpException(
            'Unauthorized',
            HttpStatus.UNAUTHORIZED,
          );
        }

        if (error.response?.status === 404) {
          throw new HttpException(
            'User not found',
            HttpStatus.NOT_FOUND,
          );
        }

        throw new HttpException(
          error.response?.data?.message || 'Failed to fetch user info',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException(
        'Failed to fetch user info',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Logout endpoint - notifies backend to clear refresh token
   * ASSUMPTION: Backend has POST /auth/logout endpoint
   */
  async logout(clientId: string): Promise<void> {
    try {
      this.logger.debug(`Logging out client: ${clientId}`);

      // Construct logout endpoint - assume POST /auth/logout
      const logoutEndpoint = '/auth/logout';

      await this.axiosInstance.post(logoutEndpoint, {
        clientId,
      });

      this.logger.debug(`Successfully logged out client: ${clientId}`);
    } catch (error) {
      this.logger.error(`Logout failed for client: ${clientId}`, error instanceof Error ? error.message : error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          // Backend doesn't have logout endpoint, just warn
          this.logger.warn(`Backend logout endpoint not found for client: ${clientId}`);
          return;
        }

        throw new HttpException(
          error.response?.data?.message || 'Backend logout failed',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException(
        'Backend logout failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
