import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';

interface LoginAttempt {
  count: number;
  firstAttemptTime: number;
  lockedUntil?: number;
}

/**
 * In-memory rate limiter for login attempts
 * In production, consider using Redis for distributed systems
 */
@Injectable()
export class RateLimitService {
  private loginAttempts: Map<string, LoginAttempt> = new Map();
  private readonly windowMs: number;
  private readonly maxAttempts: number;
  private readonly lockoutDurationMs: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(private configService: ConfigService) {
    this.windowMs = this.configService.getNumber('RATE_LIMIT_WINDOW_MS', 900000); // 15 min
    this.maxAttempts = this.configService.getNumber('RATE_LIMIT_MAX_ATTEMPTS', 3);
    this.lockoutDurationMs = this.configService.getNumber('RATE_LIMIT_LOCKOUT_DURATION_MS', 900000); // 15 min

    // Clean up old entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Record a failed login attempt for the given email/identifier
   * Returns true if the attempt was recorded, false if account is locked
   */
  recordFailedAttempt(identifier: string): boolean {
    const now = Date.now();
    const attempt = this.loginAttempts.get(identifier);

    // Check if account is locked
    if (attempt?.lockedUntil && now < attempt.lockedUntil) {
      return false;
    }

    // Clear lockout if expired
    if (attempt?.lockedUntil && now >= attempt.lockedUntil) {
      attempt.lockedUntil = undefined;
      attempt.count = 0;
      attempt.firstAttemptTime = now;
    }

    // Initialize or update attempt
    if (!attempt) {
      this.loginAttempts.set(identifier, {
        count: 1,
        firstAttemptTime: now,
      });
    } else {
      // If outside the time window, reset
      if (now - attempt.firstAttemptTime > this.windowMs) {
        this.loginAttempts.set(identifier, {
          count: 1,
          firstAttemptTime: now,
        });
      } else {
        // Still within window, increment
        attempt.count++;

        // Lock account if max attempts exceeded
        if (attempt.count >= this.maxAttempts) {
          attempt.lockedUntil = now + this.lockoutDurationMs;
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if an account is currently locked
   */
  isLocked(identifier: string): boolean {
    const attempt = this.loginAttempts.get(identifier);
    if (!attempt || !attempt.lockedUntil) {
      return false;
    }
    const now = Date.now();
    if (now >= attempt.lockedUntil) {
      attempt.lockedUntil = undefined;
      attempt.count = 0;
      return false;
    }
    return true;
  }

  /**
   * Get lockout time remaining in milliseconds
   */
  getLockoutTimeRemaining(identifier: string): number {
    const attempt = this.loginAttempts.get(identifier);
    if (!attempt || !attempt.lockedUntil) {
      return 0;
    }
    const now = Date.now();
    if (now >= attempt.lockedUntil) {
      return 0;
    }
    return attempt.lockedUntil - now;
  }

  /**
   * Clear attempts for an identifier (e.g., on successful login)
   */
  clearAttempts(identifier: string): void {
    this.loginAttempts.delete(identifier);
  }

  /**
   * Cleanup old entries that are no longer relevant
   */
  private cleanup(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    this.loginAttempts.forEach((attempt, identifier) => {
      // Remove entries older than 2x the window or if lock has expired and count is 0
      if (
        now - attempt.firstAttemptTime > this.windowMs * 2 ||
        (attempt.lockedUntil && now > attempt.lockedUntil + this.windowMs)
      ) {
        entriesToDelete.push(identifier);
      }
    });

    entriesToDelete.forEach((id) => this.loginAttempts.delete(id));
  }
}
