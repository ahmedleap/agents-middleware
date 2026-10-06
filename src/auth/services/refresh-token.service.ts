import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthSession } from '../entities/auth-session.entity';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    @InjectRepository(AuthSession)
    private authSessionRepository: Repository<AuthSession>,
  ) {}

  /**
   * Hash a token for storage in database (SHA256)
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Create and store a new refresh token session
   */
  async storeRefreshToken(
    clientId: string,
    refreshToken: string,
    accessToken: string,
    refreshTokenExpiresIn: number,
    accessTokenExpiresIn: number,
  ): Promise<string> {
    const sessionId = uuidv4();
    const now = new Date();
    const refreshExpiresAt = new Date(now.getTime() + refreshTokenExpiresIn * 1000);
    const accessExpiresAt = new Date(now.getTime() + accessTokenExpiresIn * 1000);

    const session = new AuthSession();
    session.session_id = sessionId;
    session.client_id = clientId;
    session.refresh_token_hash = this.hashToken(refreshToken);
    session.access_token_hash = this.hashToken(accessToken);
    session.created_at = now;
    session.last_active = now;
    session.refresh_expires_at = refreshExpiresAt;
    session.access_expires_at = accessExpiresAt;

    try {
      await this.authSessionRepository.save(session);
      this.logger.debug(`Stored refresh token session for client: ${clientId}`);
      return sessionId;
    } catch (error) {
      this.logger.error(`Failed to store refresh token for client: ${clientId}`, error);
      throw new HttpException(
        'Failed to create session',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Validate a refresh token against the database
   * Returns the session if valid, null if invalid or expired
   */
  async validateRefreshToken(clientId: string, refreshToken: string): Promise<AuthSession | null> {
    const tokenHash = this.hashToken(refreshToken);
    const now = new Date();

    try {
      const session = await this.authSessionRepository.findOne({
        where: {
          client_id: clientId,
          refresh_token_hash: tokenHash,
        },
      });

      if (!session) {
        this.logger.warn(`Refresh token not found for client: ${clientId}`);
        return null;
      }

      if (session.revoked_at) {
        this.logger.warn(`Refresh token is revoked for client: ${clientId}`);
        return null;
      }

      if (session.refresh_expires_at < now) {
        this.logger.warn(`Refresh token expired for client: ${clientId}`);
        return null;
      }

      return session;
    } catch (error) {
      this.logger.error(`Failed to validate refresh token for client: ${clientId}`, error);
      throw new HttpException(
        'Token validation failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update refresh token (on refresh endpoint)
   */
  async updateRefreshToken(
    sessionId: string,
    newRefreshToken: string,
    newAccessToken: string,
    refreshTokenExpiresIn: number,
    accessTokenExpiresIn: number,
  ): Promise<void> {
    const now = new Date();
    const refreshExpiresAt = new Date(now.getTime() + refreshTokenExpiresIn * 1000);
    const accessExpiresAt = new Date(now.getTime() + accessTokenExpiresIn * 1000);

    try {
      await this.authSessionRepository.update(sessionId, {
        refresh_token_hash: this.hashToken(newRefreshToken),
        access_token_hash: this.hashToken(newAccessToken),
        last_active: now,
        refresh_expires_at: refreshExpiresAt,
        access_expires_at: accessExpiresAt,
      });

      this.logger.debug(`Updated refresh token for session: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to update refresh token for session: ${sessionId}`, error);
      throw new HttpException(
        'Failed to refresh token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Revoke a refresh token (on logout)
   */
  async revokeRefreshToken(clientId: string, refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const now = new Date();

    try {
      await this.authSessionRepository.update(
        {
          client_id: clientId,
          refresh_token_hash: tokenHash,
        },
        {
          revoked_at: now,
        },
      );

      this.logger.debug(`Revoked refresh token for client: ${clientId}`);
    } catch (error) {
      this.logger.error(`Failed to revoke refresh token for client: ${clientId}`, error);
      throw new HttpException(
        'Failed to logout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Cleanup expired tokens (should be run periodically)
   */
  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date();

    try {
      const query = this.authSessionRepository
        .createQueryBuilder()
        .delete()
        .from(AuthSession)
        .where('refresh_expires_at < :now', { now });

      const result = await query.execute();

      if (result.affected && result.affected > 0) {
        this.logger.debug(`Cleaned up ${result.affected} expired refresh token sessions`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens', error);
    }
  }

  /**
   * Revoke all active sessions for a client (e.g., on password change)
   */
  async revokeAllSessions(clientId: string): Promise<void> {
    const now = new Date();

    try {
      const query = this.authSessionRepository
        .createQueryBuilder()
        .update(AuthSession)
        .set({ revoked_at: now })
        .where('client_id = :clientId', { clientId })
        .andWhere('revoked_at IS NULL');

      await query.execute();

      this.logger.debug(`Revoked all sessions for client: ${clientId}`);
    } catch (error) {
      this.logger.error(`Failed to revoke all sessions for client: ${clientId}`, error);
      throw new HttpException(
        'Failed to revoke sessions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
