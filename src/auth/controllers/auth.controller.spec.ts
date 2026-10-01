import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockLoginResponse = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresIn: 900,
    user: {
      clientId: 'test-client-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'CLIENT',
    },
    dashboard: {
      accounts: [],
      portfolioValue: 50000,
    },
  };

  const mockRefreshResponse = {
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    expiresIn: 900,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn(),
            refresh: jest.fn(),
            validateAccessToken: jest.fn(),
            logout: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should return login response', async () => {
      jest.spyOn(authService, 'login').mockResolvedValue(mockLoginResponse);

      const result = await controller.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual(mockLoginResponse);
      expect(authService.login).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should throw exception for invalid credentials', async () => {
      jest
        .spyOn(authService, 'login')
        .mockRejectedValue(
          new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED),
        );

      await expect(
        controller.login({
          email: 'test@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('refresh', () => {
    it('should return refresh response', async () => {
      jest.spyOn(authService, 'refresh').mockResolvedValue(mockRefreshResponse);

      const result = await controller.refresh({
        clientId: 'test-client-123',
        refreshToken: 'mock-refresh-token',
      });

      expect(result).toEqual(mockRefreshResponse);
      expect(authService.refresh).toHaveBeenCalledWith(
        'test-client-123',
        'mock-refresh-token',
      );
    });
  });

  describe('validateToken', () => {
    it('should return valid true for valid token', () => {
      jest.spyOn(authService, 'validateAccessToken').mockReturnValue(true);

      const result = controller.validateToken('valid-token');

      expect(result).toEqual({ valid: true });
    });

    it('should return valid false for invalid token', () => {
      jest.spyOn(authService, 'validateAccessToken').mockReturnValue(false);

      const result = controller.validateToken('invalid-token');

      expect(result).toEqual({ valid: false });
    });
  });

  describe('logout', () => {
    it('should return logout message', async () => {
      jest.spyOn(authService, 'logout').mockResolvedValue(undefined);

      const result = await controller.logout({
        clientId: 'test-client-123',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });

      expect(result).toEqual({ message: 'Logout successful', success: true });
      expect(authService.logout).toHaveBeenCalledWith(
        'test-client-123',
        'mock-access-token',
        'mock-refresh-token',
      );
    });

    it('should work with just access token', async () => {
      jest.spyOn(authService, 'logout').mockResolvedValue(undefined);

      const result = await controller.logout({
        clientId: 'test-client-123',
        accessToken: 'mock-access-token',
      });

      expect(result).toEqual({ message: 'Logout successful', success: true });
      expect(authService.logout).toHaveBeenCalledWith('test-client-123', 'mock-access-token', undefined);
    });
  });
});
