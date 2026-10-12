import { Test, TestingModule } from '@nestjs/testing';
import { JwtTokenService } from '../services/jwt-token.service';
import { GenerateTokenPayload, UserRole, TokenErrorType } from '../types/jwt-types';
import { ConfigService } from '../../config/config.service';
import { generateKeyPairSync } from 'crypto';

describe('JwtTokenService', () => {
  let service: JwtTokenService;
  let configService: ConfigService;
  beforeEach(async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          JWT_PRIVATE_KEY: privateKey,
          JWT_PUBLIC_KEY: publicKey,
        };
        return config[key] ?? defaultValue;
      }),
      getJwtPrivateKey: jest.fn(() => privateKey),
      getJwtPublicKey: jest.fn(() => publicKey),
      getNumber: jest.fn((key: string, defaultValue?: number) => {
        const config: Record<string, number> = {
          JWT_ACCESS_TOKEN_EXPIRY: 300,
          JWT_REFRESH_TOKEN_EXPIRY: 600,
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
      const payload: GenerateTokenPayload = {
        sub: 'test-client-123',
        email: 'test@example.com',
        role: UserRole.CLIENT,
      };

      const result = service.generateTokenPair(payload);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.accessTokenExpiresIn).toBe(300);
      expect(result.refreshTokenExpiresIn).toBe(600);
    });

    it('should generate valid JWT tokens with required claims', () => {
      const payload: GenerateTokenPayload = {
        sub: 'test-client-123',
        email: 'test@example.com',
        role: UserRole.ANALYST,
      };

      const result = service.generateTokenPair(payload);
      const verified = service.verifyToken(result.accessToken);

      expect(verified).toBeDefined();
      expect(verified.sub).toBe('test-client-123');
      expect(verified.email).toBe('test@example.com');
      expect(verified.role).toBe(UserRole.ANALYST);
      expect(verified.jti).toBeDefined();
    });

    it('should throw error for missing sub', () => {
      const payload = {
        email: 'test@example.com',
        role: UserRole.CLIENT,
      } as any;

      expect(() => service.generateTokenPair(payload)).toThrow();
    });

    it('should throw error for missing role', () => {
      const payload = {
        sub: 'test-client-123',
        email: 'test@example.com',
      } as any;

      expect(() => service.generateTokenPair(payload)).toThrow();
    });

    it('should throw error for invalid role', () => {
      const payload = {
        sub: 'test-client-123',
        email: 'test@example.com',
        role: 'INVALID_ROLE',
      } as any;

      expect(() => service.generateTokenPair(payload)).toThrow();
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const payload: GenerateTokenPayload = {
        sub: 'test-client-123',
        email: 'test@example.com',
        role: UserRole.CLIENT,
      };

      const { accessToken } = service.generateTokenPair(payload);
      const verified = service.verifyToken(accessToken);

      expect(verified).toBeDefined();
      expect(verified.sub).toBe('test-client-123');
    });

    it('should throw error for invalid token', () => {
      expect(() => service.verifyToken('invalid-token')).toThrow();
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const payload: GenerateTokenPayload = {
        sub: 'test-client-123',
        email: 'test@example.com',
        role: UserRole.CLIENT,
      };

      const { accessToken } = service.generateTokenPair(payload);
      const decoded = service.decodeToken(accessToken);

      expect(decoded).toBeDefined();
      expect(decoded?.sub).toBe('test-client-123');
    });

    it('should return null for malformed token', () => {
      const result = service.decodeToken('not.a.token');
      expect(result).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for non-expired token', () => {
      const payload: GenerateTokenPayload = {
        sub: 'test-client-123',
        email: 'test@example.com',
        role: UserRole.CLIENT,
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
      const payload: GenerateTokenPayload = {
        sub: 'test-client-123',
        email: 'test@example.com',
        role: UserRole.CLIENT,
      };

      const { accessToken } = service.generateTokenPair(payload);
      const timeRemaining = service.getTimeUntilExpiration(accessToken);

      expect(timeRemaining).toBeGreaterThan(0);
      expect(timeRemaining).toBeLessThanOrEqual(300);
    });
  });

  describe('extractJti', () => {
    it('should extract JTI from token', () => {
      const payload: GenerateTokenPayload = {
        sub: 'test-client-123',
        email: 'test@example.com',
        role: UserRole.ADMIN,
      };

      const { accessToken } = service.generateTokenPair(payload);
      const jti = service.extractJti(accessToken);

      expect(jti).toBeDefined();
      expect(typeof jti).toBe('string');
    });
  });
});
