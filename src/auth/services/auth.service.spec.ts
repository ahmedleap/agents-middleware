import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { JwtTokenService } from '../services/jwt-token.service';
import { RateLimitService } from '../services/rate-limit.service';
import { BackendIntegrationService } from '../services/backend-integration.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwtTokenService: JwtTokenService;
  let rateLimitService: RateLimitService;
  let backendIntegrationService: BackendIntegrationService;

  const mockLoginResponse = {
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtTokenService,
          useValue: {
            generateTokenPair: jest.fn(() => ({
              accessToken: 'mock-access-token',
              refreshToken: 'mock-refresh-token',
              accessTokenExpiresIn: 900,
              refreshTokenExpiresIn: 900,
            })),
            verifyToken: jest.fn((token) => ({
              clientId: 'test-client-123',
              email: 'test@example.com',
              role: 'CLIENT',
            })),
          },
        },
        {
          provide: RateLimitService,
          useValue: {
            isLocked: jest.fn(() => false),
            recordFailedAttempt: jest.fn(() => true),
            clearAttempts: jest.fn(),
            getLockoutTimeRemaining: jest.fn(() => 0),
          },
        },
        {
          provide: BackendIntegrationService,
          useValue: {
            authenticateUser: jest.fn(),
            refreshToken: jest.fn(),
            logout: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtTokenService = module.get<JwtTokenService>(JwtTokenService);
    rateLimitService = module.get<RateLimitService>(RateLimitService);
    backendIntegrationService = module.get<BackendIntegrationService>(
      BackendIntegrationService,
    );
  });

  describe('login', () => {
    it('should successfully login user', async () => {
      jest
        .spyOn(backendIntegrationService, 'authenticateUser')
        .mockResolvedValue(mockLoginResponse);

      const result = await service.login('test@example.com', 'password123');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('dashboard');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw error for invalid credentials', async () => {
      jest
        .spyOn(backendIntegrationService, 'authenticateUser')
        .mockRejectedValue(
          new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED),
        );

      await expect(service.login('test@example.com', 'wrong-password')).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw error if account is locked', async () => {
      jest.spyOn(rateLimitService, 'isLocked').mockReturnValue(true);
      jest.spyOn(rateLimitService, 'getLockoutTimeRemaining').mockReturnValue(600000);

      await expect(service.login('test@example.com', 'password123')).rejects.toThrow(
        HttpException,
      );
    });

    it('should clear rate limit on successful login', async () => {
      jest
        .spyOn(backendIntegrationService, 'authenticateUser')
        .mockResolvedValue(mockLoginResponse);

      await service.login('test@example.com', 'password123');

      expect(rateLimitService.clearAttempts).toHaveBeenCalledWith('test@example.com');
    });

    it('should record failed attempt on login failure', async () => {
      jest
        .spyOn(backendIntegrationService, 'authenticateUser')
        .mockRejectedValue(
          new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED),
        );

      try {
        await service.login('test@example.com', 'wrong-password');
      } catch (e) {
        // Expected error
      }

      expect(rateLimitService.recordFailedAttempt).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('refresh', () => {
    it('should refresh tokens successfully', async () => {
      jest
        .spyOn(backendIntegrationService, 'refreshToken')
        .mockResolvedValue({
          clientId: 'test-client-123',
          refreshTokenUpdated: true,
        });

      const result = await service.refresh('test-client-123', 'mock-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
    });

    it('should throw error for invalid refresh token', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue(null);

      await expect(
        service.refresh('test-client-123', 'invalid-token'),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error if client ID does not match', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue({
        clientId: 'different-client',
        email: 'test@example.com',
      });

      await expect(
        service.refresh('test-client-123', 'mock-refresh-token'),
      ).rejects.toThrow(HttpException);
    });

    it('should call backend to update refresh token', async () => {
      jest
        .spyOn(backendIntegrationService, 'refreshToken')
        .mockResolvedValue({
          clientId: 'test-client-123',
          refreshTokenUpdated: true,
        });

      await service.refresh('test-client-123', 'mock-refresh-token');

      expect(backendIntegrationService.refreshToken).toHaveBeenCalledWith(
        'test-client-123',
        'mock-refresh-token',
      );
    });
  });

  describe('validateAccessToken', () => {
    it('should return true for valid token', () => {
      jest
        .spyOn(jwtTokenService, 'verifyToken')
        .mockReturnValue({
          clientId: 'test-client-123',
          email: 'test@example.com',
        });

      const result = service.validateAccessToken('valid-token');
      expect(result).toBe(true);
    });

    it('should return false for invalid token', () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue(null);

      const result = service.validateAccessToken('invalid-token');
      expect(result).toBe(false);
    });
  });

  describe('logout', () => {
    it('should successfully logout user with both tokens', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue({
        clientId: 'test-client-123',
        email: 'test@example.com',
      });
      jest.spyOn(backendIntegrationService, 'logout').mockResolvedValue(undefined);

      await expect(
        service.logout('test-client-123', 'mock-access-token', 'mock-refresh-token'),
      ).resolves.toBeUndefined();

      expect(backendIntegrationService.logout).toHaveBeenCalledWith('test-client-123');
    });

    it('should throw error for invalid access token during logout', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue(null);

      await expect(
        service.logout('test-client-123', 'invalid-token'),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error if client ID does not match token', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue({
        clientId: 'different-client',
        email: 'test@example.com',
      });

      await expect(
        service.logout('test-client-123', 'mock-access-token'),
      ).rejects.toThrow(HttpException);
    });

    it('should blacklist access token after logout', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue({
        clientId: 'test-client-123',
        email: 'test@example.com',
      });
      jest.spyOn(backendIntegrationService, 'logout').mockResolvedValue(undefined);

      await service.logout('test-client-123', 'mock-access-token', 'mock-refresh-token');

      // After logout, token validation should fail
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue({
        clientId: 'test-client-123',
        email: 'test@example.com',
      });

      const isValid = service.validateAccessToken('mock-access-token');
      expect(isValid).toBe(false);
    });

    it('should handle backend logout failure gracefully', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue({
        clientId: 'test-client-123',
        email: 'test@example.com',
      });
      jest
        .spyOn(backendIntegrationService, 'logout')
        .mockRejectedValue(new Error('Backend error'));

      // Should not throw - fails gracefully
      await expect(
        service.logout('test-client-123', 'mock-access-token'),
      ).resolves.toBeUndefined();
    });
  });
});
