import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthSession } from '../entities/auth-session.entity';
import { RefreshTokenService } from './refresh-token.service';
import * as crypto from 'crypto';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let queryBuilder: any;
  let transactionManager: any;
  let repository: any;

  beforeEach(() => {
    queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    transactionManager = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      save: jest.fn().mockImplementation(async (session) => session),
    };
    repository = {
      manager: {
        transaction: jest.fn((callback) => callback(transactionManager)),
      },
    };
    service = new RefreshTokenService(repository);
  });

  it('marks the consumed session revoked and stores only the replacement token hash', async () => {
    await service.rotateRefreshToken('session-1', 'client-1', 'old-token', 'new-token', 600);

    expect(queryBuilder.set).toHaveBeenCalledWith({ revoked_at: expect.any(Date) });
    expect(queryBuilder.where).toHaveBeenCalledWith('session_id = :sessionId', {
      sessionId: 'session-1',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('client_id = :clientId', {
      clientId: 'client-1',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'refresh_token_hash = :tokenHash',
      { tokenHash: crypto.createHash('sha256').update('old-token').digest('hex') },
    );

    const replacementSession = transactionManager.save.mock.calls[0][0] as AuthSession;
    expect(replacementSession.client_id).toBe('client-1');
    expect(replacementSession.refresh_token_hash).toBe(
      crypto.createHash('sha256').update('new-token').digest('hex'),
    );
    expect(replacementSession.refresh_token_hash).not.toBe('new-token');
    expect(replacementSession.revoked_at).toBeUndefined();
    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects replay when the old session was already revoked', async () => {
    queryBuilder.execute.mockResolvedValue({ affected: 0 });

    await expect(
      service.rotateRefreshToken('session-1', 'client-1', 'old-token', 'new-token', 600),
    ).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
    expect(transactionManager.save).not.toHaveBeenCalled();
  });
});
