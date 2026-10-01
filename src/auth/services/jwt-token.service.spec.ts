import { Test, TestingModule } from '@nestjs/testing';
import { JwtTokenService, TokenPayload } from '../services/jwt-token.service';
import { ConfigService } from '../../config/config.service';

describe('JwtTokenService', () => {
  let service: JwtTokenService;
  let configService: ConfigService;

  beforeEach(async () => {
    // Mock ConfigService
    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          JWT_SECRET: 'test-secret-key',
          JWT_ACCESS_TOKEN_EXPIRY: 900,
          JWT_REFRESH_TOKEN_EXPIRY: 900,
        };
        return config[key] ?? defaultValue;
      }),
      getNumber: jest.fn((key: string, defaultValue?: number) => {
        const config: Record<string, number> = {
          JWT_ACCESS_TOKEN_EXPIRY: 900,
          JWT_REFRESH_TOKEN_EXPIRY: 900,
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtTokenService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<JwtTokenService>(JwtTokenService);
  });

  describe('generateTokenPair', () => {
    it('should generate access and refresh tokens', () => {
      const payload = {
        clientId: 'test-client-123',
        email: 'test@example.com',
        role: 'CLIENT',
      };

      const result = service.generateTokenPair(payload);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.accessTokenExpiresIn).toBe(900);
      expect(result.refreshTokenExpiresIn).toBe(900);
    });

    it('should generate valid JWT tokens', () => {
      const payload = {
        clientId: 'test-client-123',
        email: 'test@example.com',
      };

      const result = service.generateTokenPair(payload);
      const decoded = service.verifyToken(result.accessToken);

      expect(decoded).toBeDefined();
      expect(decoded?.clientId).toBe('test-client-123');
      expect(decoded?.email).toBe('test@example.com');
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const payload = {
        clientId: 'test-client-123',
        email: 'test@example.com',
      };

      const { accessToken } = service.generateTokenPair(payload);
      const verified = service.verifyToken(accessToken);

      expect(verified).toBeDefined();
      expect(verified?.clientId).toBe('test-client-123');
    });

    it('should return null for invalid token', () => {
      const result = service.verifyToken('invalid-token');
      expect(result).toBeNull();
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const payload = {
        clientId: 'test-client-123',
        email: 'test@example.com',
      };

      const { accessToken } = service.generateTokenPair(payload);
      const decoded = service.decodeToken(accessToken);

      expect(decoded).toBeDefined();
      expect(decoded?.clientId).toBe('test-client-123');
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for non-expired token', () => {
      const payload = {
        clientId: 'test-client-123',
        email: 'test@example.com',
      };

      const { accessToken } = service.generateTokenPair(payload);
      const isExpired = service.isTokenExpired(accessToken);

      expect(isExpired).toBe(false);
    });

    it('should return true for invalid token', () => {
      const isExpired = service.isTokenExpired('invalid-token');
      expect(isExpired).toBe(true);
    });
  });

  describe('getTimeUntilExpiration', () => {
    it('should return time remaining until token expires', () => {
      const payload = {
        clientId: 'test-client-123',
        email: 'test@example.com',
      };

      const { accessToken } = service.generateTokenPair(payload);
      const timeRemaining = service.getTimeUntilExpiration(accessToken);

      expect(timeRemaining).toBeGreaterThan(0);
      expect(timeRemaining).toBeLessThanOrEqual(900);
    });
  });
});
