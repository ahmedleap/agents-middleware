import { Injectable, Logger } from '@nestjs/common';

interface LoginAttempt {
  count: number;
  firstAttemptTime: number;
  lockedUntil?: number;
}

/**
 * Rate Limiter for Login Attempts
 * 
 * Security Policy:
 * - 3 failed login attempts trigger a 15-minute lockout
 * - Attempts during lockout reset the timer (no penalty to counter)
 * - Successful login clears all attempts and lockout
 * - In-memory storage (use Redis in distributed systems)
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private loginAttempts: Map<string, LoginAttempt> = new Map();
  
  // Hardcoded security constants
  private readonly MAX_FAILED_ATTEMPTS = 3;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
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
   * Check if account is currently locked (read-only, no state changes)
   * 
   * @param identifier - Email or username
   * @returns true if locked and lockout has not expired
   */
  isCurrentlyLocked(identifier: string): boolean {
    const attempt = this.loginAttempts.get(identifier);
    if (!attempt || !attempt.lockedUntil) {
      return false;
    }

    const now = Date.now();
    return now < attempt.lockedUntil;
  }

  /**
   * Reset lockout timer on login attempt during lockout
   * Does not increment counter, just extends the lockout timer
   * 
   * @param identifier - Email or username
   */
  resetLockoutTimer(identifier: string): void {
    const attempt = this.loginAttempts.get(identifier);
    if (attempt && attempt.lockedUntil) {
      const now = Date.now();
      if (now < attempt.lockedUntil) {
        // Still locked - reset timer to 15 minutes from now
        const previousLockoutTime = attempt.lockedUntil;
        attempt.lockedUntil = now + this.LOCKOUT_DURATION_MS;
        
        this.logger.warn(
          `Lockout timer reset for identifier: ${identifier}, ` +
          `previous: ${new Date(previousLockoutTime).toISOString()}, ` +
          `new: ${new Date(attempt.lockedUntil).toISOString()}`,
        );
      }
    }
  }

  /**
   * Record a failed login attempt for the given identifier
   * Increments counter and locks account if max attempts reached
   * 
   * @param identifier - Email or username
   * @returns true if attempt was recorded, false if account is now locked
   */
  recordFailedAttempt(identifier: string): boolean {
    const now = Date.now();
    let attempt = this.loginAttempts.get(identifier);

    // Check if lockout has expired
    if (attempt?.lockedUntil && now >= attempt.lockedUntil) {
      // Lockout expired - reset for new attempt cycle
      attempt.lockedUntil = undefined;
      attempt.count = 0;
      attempt.firstAttemptTime = now;
      
      this.logger.debug(
        `Lockout expired for identifier: ${identifier}, ` +
        `resetting attempt counter`,
      );
    }

    // Initialize new entry if doesn't exist
    if (!attempt) {
      this.loginAttempts.set(identifier, {
        count: 1,
        firstAttemptTime: now,
      });
      
      this.logger.warn(
        `Failed login attempt [1/${this.MAX_FAILED_ATTEMPTS}] for identifier: ${identifier}`,
      );
      
      return true;
    }

    // Increment counter
    attempt.count++;

    if (attempt.count < this.MAX_FAILED_ATTEMPTS) {
      // Still under max attempts
      this.logger.warn(
        `Failed login attempt [${attempt.count}/${this.MAX_FAILED_ATTEMPTS}] for identifier: ${identifier}`,
      );
      
      return true;
    } else {
      // Reached max attempts - lock account
      attempt.lockedUntil = now + this.LOCKOUT_DURATION_MS;
      
      this.logger.error(
        `Account locked after ${this.MAX_FAILED_ATTEMPTS} failed attempts for identifier: ${identifier}, ` +
        `locked until: ${new Date(attempt.lockedUntil).toISOString()}`,
      );
      
      return false;
    }
  }

  /**
   * Get lockout time remaining in milliseconds
   * 
   * @param identifier - Email or username
   * @returns Milliseconds until lockout expires, or 0 if not locked
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
   * Clear all attempts for an identifier (e.g., on successful login)
   * 
   * @param identifier - Email or username
   */
  clearAttempts(identifier: string): void {
    const hadAttempts = this.loginAttempts.has(identifier);
    this.loginAttempts.delete(identifier);
    
    if (hadAttempts) {
      this.logger.debug(
        `Cleared login attempts for identifier: ${identifier}`,
      );
    }
  }

  /**
   * Cleanup old entries to prevent memory leaks
   * Removes entries that have been locked for more than 30 minutes
   * 
   * @private
   */
  private cleanup(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];
    const thirtyMinutesMs = 30 * 60 * 1000;

    this.loginAttempts.forEach((attempt, identifier) => {
      // Remove if lockout expired more than 30 minutes ago
      if (
        attempt.lockedUntil &&
        now - attempt.lockedUntil > thirtyMinutesMs
      ) {
        entriesToDelete.push(identifier);
      }
    });

    if (entriesToDelete.length > 0) {
      entriesToDelete.forEach((id) => this.loginAttempts.delete(id));
      this.logger.debug(`Cleaned up ${entriesToDelete.length} expired rate limit entries`);
    }
  }
}
