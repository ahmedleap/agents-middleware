import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { BackendIntegrationService } from '../services/backend-integration.service';
import { ConfigService } from '../../config/config.service';

describe('BackendIntegrationService', () => {
  let service: BackendIntegrationService;
  let configService: ConfigService;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          BACKEND_BASE_URL: 'http://localhost:8080',
          BACKEND_LOGIN_ENDPOINT: '/auth/login',
          BACKEND_REFRESH_ENDPOINT: '/auth/refresh',
          BACKEND_USER_ENDPOINT: '/users/{userId}',
        };
        return config[key] ?? defaultValue;
      }),
      getNumber: jest.fn(() => 30000),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackendIntegrationService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<BackendIntegrationService>(BackendIntegrationService);
  });

  describe('authenticateUser', () => {
    it('should successfully authenticate user', async () => {
      const mockResponse = {
        clientId: 'test-client-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'CLIENT',
        accounts: [
          {
            accountId: 'acc-123',
            name: 'Main Account',
            cashBalance: 10000,
            status: 'ACTIVE',
          },
        ],
        portfolioValue: 50000,
      };

      jest
        .spyOn(service['axiosInstance'], 'post')
        .mockResolvedValue({ data: mockResponse });

      const result = await service.authenticateUser('test@example.com', 'password123');

      expect(result).toEqual(mockResponse);
      expect(service['axiosInstance'].post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should throw UNAUTHORIZED for 401 response', async () => {
      const error = {
        response: { status: 401 },
        isAxiosError: true,
      };

      jest
        .spyOn(service['axiosInstance'], 'post')
        .mockRejectedValue(error);

      await expect(service.authenticateUser('test@example.com', 'wrong-password')).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw NOT_FOUND for 404 response', async () => {
      const error = {
        response: { status: 404 },
        isAxiosError: true,
      };

      jest
        .spyOn(service['axiosInstance'], 'post')
        .mockRejectedValue(error);

      await expect(service.authenticateUser('nonexistent@example.com', 'password123')).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw SERVICE_UNAVAILABLE on connection refused', async () => {
      const error = {
        code: 'ECONNREFUSED',
        isAxiosError: true,
      };

      jest
        .spyOn(service['axiosInstance'], 'post')
        .mockRejectedValue(error);

      await expect(service.authenticateUser('test@example.com', 'password123')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh token', async () => {
      const mockResponse = {
        clientId: 'test-client-123',
        refreshTokenUpdated: true,
        newRefreshToken: 'new-refresh-token-123',
      };

      jest
        .spyOn(service['axiosInstance'], 'post')
        .mockResolvedValue({ data: mockResponse });

      const result = await service.refreshToken(
        'test-client-123',
        'old-refresh-token',
      );

      expect(result).toEqual(mockResponse);
      expect(service['axiosInstance'].post).toHaveBeenCalledWith('/auth/refresh', {
        clientId: 'test-client-123',
        refreshToken: 'old-refresh-token',
      });
    });

    it('should throw UNAUTHORIZED for invalid refresh token', async () => {
      const error = {
        response: { status: 401 },
        isAxiosError: true,
      };

      jest
        .spyOn(service['axiosInstance'], 'post')
        .mockRejectedValue(error);

      await expect(
        service.refreshToken('test-client-123', 'invalid-token'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getUserInfo', () => {
    it('should successfully fetch user info', async () => {
      const mockResponse = {
        clientId: 'test-client-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'CLIENT',
        accounts: [
          {
            accountId: 'acc-123',
            name: 'Main Account',
            cashBalance: 10000,
            status: 'ACTIVE',
          },
        ],
      };

      jest
        .spyOn(service['axiosInstance'], 'get')
        .mockResolvedValue({ data: mockResponse });

      const result = await service.getUserInfo('test-client-123', 'access-token');

      expect(result).toEqual(mockResponse);
      expect(service['axiosInstance'].get).toHaveBeenCalledWith(
        '/users/test-client-123',
        {
          headers: {
            Authorization: 'Bearer access-token',
          },
        },
      );
    });

    it('should throw UNAUTHORIZED for invalid access token', async () => {
      const error = {
        response: { status: 401 },
        isAxiosError: true,
      };

      jest
        .spyOn(service['axiosInstance'], 'get')
        .mockRejectedValue(error);

      await expect(
        service.getUserInfo('test-client-123', 'invalid-token'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('logout', () => {
    it('should successfully call logout endpoint on backend', async () => {
      jest
        .spyOn(service['axiosInstance'], 'post')
        .mockResolvedValue({ data: {} });

      await expect(service.logout('test-client-123')).resolves.toBeUndefined();

      expect(service['axiosInstance'].post).toHaveBeenCalledWith('/auth/logout', {
        clientId: 'test-client-123',
      });
    });

    it('should handle logout endpoint not found gracefully', async () => {
      const error = {
        response: { status: 404 },
        isAxiosError: true,
      };

      jest
        .spyOn(service['axiosInstance'], 'post')
        .mockRejectedValue(error);

      // Should not throw - handles 404 gracefully
      await expect(service.logout('test-client-123')).resolves.toBeUndefined();
    });

    it('should throw error for other logout failures', async () => {
      const error = {
        response: { status: 500, data: { message: 'Server error' } },
        isAxiosError: true,
      };

      jest
        .spyOn(service['axiosInstance'], 'post')
        .mockRejectedValue(error);

      await expect(service.logout('test-client-123')).rejects.toThrow(HttpException);
    });
  });
});
