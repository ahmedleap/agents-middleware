import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { JwtTokenService } from '../services/jwt-token.service';
import { RateLimitService } from '../services/rate-limit.service';
import { RefreshTokenService } from '../services/refresh-token.service';
import { BackendIntegrationService } from '../services/backend-integration.service';
import { UserRole, VerifiedJwtPayload } from '../types/jwt-types';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import * as bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let jwtTokenService: JwtTokenService;
  let rateLimitService: RateLimitService;
  let refreshTokenService: RefreshTokenService;
  let backendIntegrationService: BackendIntegrationService;
  let mockClientRepository: any;

  const mockVerifiedPayload: VerifiedJwtPayload = {
    sub: 'test-client-123',
    email: 'test@example.com',
    role: UserRole.CLIENT,
    jti: 'mock-jti-123',
    iss: 'agents-of-leap',
    aud: 'trading-middleware',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
  };

  const mockClient = {
    client_id: 'test-client-123',
    email: 'test@example.com',
    password_hash: 'hashed-password',
    first_name: 'Test',
    last_name: 'User',
    role: UserRole.CLIENT,
  };

  beforeEach(async () => {
    mockClientRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtTokenService,
          useValue: {
            generateTokenPair: jest.fn(() => ({
              accessToken: 'mock-access-token',
              refreshToken: 'mock-refresh-token',
              accessTokenExpiresIn: 300,
              refreshTokenExpiresIn: 600,
            })),
            verifyToken: jest.fn(() => mockVerifiedPayload),
          },
        },
        {
          provide: RateLimitService,
          useValue: {
            isCurrentlyLocked: jest.fn(() => false),
            resetLockoutTimer: jest.fn(),
            recordFailedAttempt: jest.fn(() => true),
            clearAttempts: jest.fn(),
            getLockoutTimeRemaining: jest.fn(() => 0),
          },
        },
        {
          provide: RefreshTokenService,
          useValue: {
            storeRefreshToken: jest.fn(),
            validateRefreshToken: jest.fn(() => ({ session_id: 'session-123' })),
            updateRefreshToken: jest.fn(),
            revokeRefreshToken: jest.fn(),
          },
        },
        {
          provide: BackendIntegrationService,
          useValue: {
            authenticateUser: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Client),
          useValue: mockClientRepository,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtTokenService = module.get<JwtTokenService>(JwtTokenService);
    rateLimitService = module.get<RateLimitService>(RateLimitService);
    refreshTokenService = module.get<RefreshTokenService>(RefreshTokenService);
    backendIntegrationService = module.get<BackendIntegrationService>(
      BackendIntegrationService,
    );
  });

  describe('login', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockClientRepository.findOne.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jest.spyOn(backendIntegrationService, 'authenticateUser').mockResolvedValue({
        clientId: 'test-client-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.CLIENT,
        accounts: [],
      });
    });

    it('should successfully login user', async () => {
      const result = await service.login('test@example.com', 'password123');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe(UserRole.CLIENT);
      expect(rateLimitService.clearAttempts).toHaveBeenCalledWith('test@example.com');
    });

    it('should throw error if account is locked out', async () => {
      jest.spyOn(rateLimitService, 'isCurrentlyLocked').mockReturnValue(true);
      jest.spyOn(rateLimitService, 'getLockoutTimeRemaining').mockReturnValue(600000);

      await expect(service.login('test@example.com', 'password123')).rejects.toThrow(
        HttpException,
      );

      expect(rateLimitService.resetLockoutTimer).toHaveBeenCalledWith('test@example.com');
      expect(mockClientRepository.findOne).not.toHaveBeenCalled(); // No credential check
    });

    it('should lock account after 3 failed attempts', async () => {
      jest.spyOn(rateLimitService, 'isCurrentlyLocked').mockReturnValue(false);
      
      // First two attempts succeed (return true)
      jest.spyOn(rateLimitService, 'recordFailedAttempt')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false); // Third attempt returns false (locked)

      (bcrypt.compare as jest.Mock).mockResolvedValue(false); // Invalid password

      // First attempt
      mockClientRepository.findOne.mockResolvedValue(mockClient);
      await expect(service.login('test@example.com', 'wrong1')).rejects.toThrow(
        'Invalid credentials',
      );

      // Second attempt
      await expect(service.login('test@example.com', 'wrong2')).rejects.toThrow(
        'Invalid credentials',
      );

      // Third attempt - should be locked
      jest.spyOn(rateLimitService, 'getLockoutTimeRemaining').mockReturnValue(900000);
      await expect(service.login('test@example.com', 'wrong3')).rejects.toThrow(
        'Account locked',
      );
    });

    it('should record failed attempt for invalid username', async () => {
      jest.spyOn(rateLimitService, 'isCurrentlyLocked').mockReturnValue(false);
      jest.spyOn(rateLimitService, 'recordFailedAttempt').mockReturnValue(true);
      mockClientRepository.findOne.mockResolvedValue(null);

      await expect(service.login('nonexistent@example.com', 'password123')).rejects.toThrow(
        'Invalid credentials',
      );

      expect(rateLimitService.recordFailedAttempt).toHaveBeenCalledWith(
        'nonexistent@example.com',
      );
    });

    it('should record failed attempt for invalid password', async () => {
      jest.spyOn(rateLimitService, 'isCurrentlyLocked').mockReturnValue(false);
      jest.spyOn(rateLimitService, 'recordFailedAttempt').mockReturnValue(true);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login('test@example.com', 'wrongpassword')).rejects.toThrow(
        'Invalid credentials',
      );

      expect(rateLimitService.recordFailedAttempt).toHaveBeenCalledWith('test@example.com');
    });

    it('should not record failed attempt on successful login', async () => {
      jest.spyOn(rateLimitService, 'isCurrentlyLocked').mockReturnValue(false);

      await service.login('test@example.com', 'password123');

      expect(rateLimitService.recordFailedAttempt).not.toHaveBeenCalled();
    });

    it('should clear attempts on successful login', async () => {
      jest.spyOn(rateLimitService, 'isCurrentlyLocked').mockReturnValue(false);

      await service.login('test@example.com', 'password123');

      expect(rateLimitService.clearAttempts).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('refresh', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(refreshTokenService, 'validateRefreshToken').mockResolvedValue({
        session_id: 'session-123',
      } as any);
    });

    it('should refresh tokens successfully', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue(mockVerifiedPayload);

      const result = await service.refresh('test-client-123', 'mock-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
    });

    it('should throw error for invalid refresh token', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        service.refresh('test-client-123', 'invalid-token'),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error if client ID does not match', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue({
        ...mockVerifiedPayload,
        sub: 'different-client',
      });

      await expect(
        service.refresh('test-client-123', 'mock-refresh-token'),
      ).rejects.toThrow(HttpException);
    });

    it('should preserve role in refreshed tokens', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue({
        ...mockVerifiedPayload,
        role: UserRole.ANALYST,
      });

      await service.refresh('test-client-123', 'mock-refresh-token');

      expect(jwtTokenService.generateTokenPair).toHaveBeenCalledWith(
        expect.objectContaining({
          role: UserRole.ANALYST,
        }),
      );
    });
  });

  describe('validateAccessToken', () => {
    it('should return true for valid token', () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue(mockVerifiedPayload);

      const result = service.validateAccessToken('valid-token');
      expect(result).toBe(true);
    });

    it('should return false for invalid token', () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = service.validateAccessToken('invalid-token');
      expect(result).toBe(false);
    });
  });

  describe('logout', () => {
    it('should successfully logout user with refresh token', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue(mockVerifiedPayload);

      await expect(
        service.logout('test-client-123', 'mock-refresh-token'),
      ).resolves.toBeUndefined();

      expect(refreshTokenService.revokeRefreshToken).toHaveBeenCalled();
    });

    it('should throw error for invalid refresh token during logout', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        service.logout('test-client-123', 'invalid-token'),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error if client ID does not match token', async () => {
      jest.spyOn(jwtTokenService, 'verifyToken').mockReturnValue({
        ...mockVerifiedPayload,
        sub: 'different-client',
      });

      await expect(
        service.logout('test-client-123', 'mock-refresh-token'),
      ).rejects.toThrow(HttpException);
    });
  });
});
