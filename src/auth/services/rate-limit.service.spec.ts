import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitService } from '../services/rate-limit.service';
import { ConfigService } from '../../config/config.service';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let configService: ConfigService;

  beforeEach(async () => {
    configService = {
      getNumber: jest.fn((key: string, defaultValue?: number) => {
        const config: Record<string, number> = {
          RATE_LIMIT_WINDOW_MS: 900000,
          RATE_LIMIT_MAX_ATTEMPTS: 3,
          RATE_LIMIT_LOCKOUT_DURATION_MS: 900000,
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('recordFailedAttempt', () => {
    it('should record a failed attempt', () => {
      const result = service.recordFailedAttempt('test@example.com');
      expect(result).toBe(true);
    });

    it('should return false after max attempts reached', () => {
      const email = 'test@example.com';

      // Record 3 failed attempts
      service.recordFailedAttempt(email);
      service.recordFailedAttempt(email);
      const thirdResult = service.recordFailedAttempt(email);

      // Third attempt should trigger lockout
      expect(thirdResult).toBe(false);
    });

    it('should prevent further attempts when locked', () => {
      const email = 'test@example.com';

      // Lock the account
      service.recordFailedAttempt(email);
      service.recordFailedAttempt(email);
      service.recordFailedAttempt(email);

      // Further attempts should fail
      const result = service.recordFailedAttempt(email);
      expect(result).toBe(false);
    });
  });

  describe('isLocked', () => {
    it('should return false for non-existent email', () => {
      const result = service.isLocked('nonexistent@example.com');
      expect(result).toBe(false);
    });

    it('should return true for locked account', () => {
      const email = 'test@example.com';

      // Lock the account
      service.recordFailedAttempt(email);
      service.recordFailedAttempt(email);
      service.recordFailedAttempt(email);

      const result = service.isLocked(email);
      expect(result).toBe(true);
    });
  });

  describe('clearAttempts', () => {
    it('should clear attempts for an email', () => {
      const email = 'test@example.com';

      service.recordFailedAttempt(email);
      service.recordFailedAttempt(email);

      service.clearAttempts(email);

      // After clearing, should be able to record attempts again
      const result = service.recordFailedAttempt(email);
      expect(result).toBe(true);
    });
  });

  describe('getLockoutTimeRemaining', () => {
    it('should return 0 for non-locked account', () => {
      const result = service.getLockoutTimeRemaining('test@example.com');
      expect(result).toBe(0);
    });

    it('should return remaining lockout time for locked account', () => {
      const email = 'test@example.com';

      service.recordFailedAttempt(email);
      service.recordFailedAttempt(email);
      service.recordFailedAttempt(email);

      const result = service.getLockoutTimeRemaining(email);
      expect(result).toBeGreaterThan(0);
    });
  });
});
