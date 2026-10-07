import { Test, TestingModule } from '@nestjs/testing';
import { JwtTokenService } from '../services/jwt-token.service';
import { GenerateTokenPayload, UserRole, TokenErrorType } from '../types/jwt-types';
import { ConfigService } from '../../config/config.service';

describe('JwtTokenService', () => {
  let service: JwtTokenService;
  let configService: ConfigService;

  beforeEach(async () => {
    // Mock ConfigService with RSA keys
    const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA2a4zI8Y5VpWfJLBj4W7ug7hcfFt9JLEh5f5u0W6J7h9lH/x5
UvLd8yH5nJvBKvJ3L0S6p8l5cJL5zKpL5c9L0kL5zH5kH8Y9f5j5jK5yK5lL5mL5
nM5oN5pO5qP5rQ5sR5tS5uT5vU5wV5xW5yX5zY5aZ5bA6cB6dC6eD6fE6gF6hG6
iH6jI6kJ6lK6mL6nM6oN6pO6qP6rQ6sR6tS6uT6vU6wV6xW6yX6zY6aZ6bA7cB7
dC7eD7fE7gF7hG7iH7jI7kJ7lK7mL7nM7oN7pO7qP7rQ7sR7tS7uT7vU7wV7xW7
yX7zY7aZ7bA8cB8dC8eD8fE8gF8hG8iH8jI8kJ8lK8mL8nM8oN8pO8qP8rQ8sR8t
S8uT8vU8wV8xW8yX8zY8aZ8bA9cB9dC9eD9fE9gF9hG9iH9jI9kJ9lK9mL9nM9o
N9pO9qP9rQ9sR9tS9uT9vU9wV9xW9yX9zY9aZ9bAECAwEAAQKCAQEA0D9uK8qH
C2S5I5F5H5jL5mM5oN5pP5r5tU5wV5yX5aY5cZ5dA6eB6fC6gD6hE6iF6jG6kH6
lI6mJ6nK6oL6pM6qN6rO6sP6tQ6uR6vS6wT6xU6yV6zW6aX6bY6cZ6dA7eB7fC7
gD7hE7iF7jG7kH7lI7mJ7nK7oL7pM7qN7rO7sP7tQ7uR7vS7wT7xU7yV7zW7aX7
bY7cZ7dA8eB8fC8gD8hE8iF8jG8kH8lI8mJ8nK8oL8pM8qN8rO8sP8tQ8uR8vS8w
T8xU8yV8zW8aX8bY8cZ8dA9eB9fC9gD9hE9iF9jG9kH9lI9mJ9nK9oL9pM9qN9r
O9sP9tQ9uR9vS9wT9xU9yV9zW9aX9bY9cZ9dAAECQQD7oL6l+4+eF6nH7nI7pL7
qM7rN7sO7tP7uQ7vR7wS7xT7yU7zV7aW7bX7cY7dZ7eA8eB8fC8gD8hE8iF8jG8k
H8lI8mJ8nK8oL8pM8qN8rO8sP8tQ8uR8vS8wT8xU8yV8zW8aX8bY8cZ8dA9eB9f
C9gD9hE9iF9jG9kH9lI9mJ9nK9oL9pM9qN9rO9sP9tQ9uR9vS9wT9xU9yV9zW9a
X9bY9cZ9dAAkCQQDbyP5zb+3Ni2Pk3IkrUbR5LfHz7fHz8fLx8vLz8vPz9PPz9PP
z8/Py8/Ly8/Lz8vPy8/Lz8/Pz8/Py8vPz8/Pz9PPz8/Pz8/Pz8vPz8/Pz8/P
z8vPz8/Pz8/Pz8vPz8/Pz8/Pz8vPz8/Pz8/Pz8/Pz8/Pz8/Pz8vPz8/Pz8/
Pz8vPz8vPz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8vPz8/Pz8/Pz8vPz
8/Pz8/Pz8/Pz8/Pz8/PwJBANq9xg+8fP6fQ/5PVV8FN0JzHf5zF5MzQ8J1G9O
2L5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL
5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5g
L5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5gL5
-----END RSA PRIVATE KEY-----`;

    const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a4zI8Y5VpWfJLBj4W7u
g7hcfFt9JLEh5f5u0W6J7h9lH/x5UvLd8yH5nJvBKvJ3L0S6p8l5cJL5zKpL5c9L
0kL5zH5kH8Y9f5j5jK5yK5lL5mL5nM5oN5pO5qP5rQ5sR5tS5uT5vU5wV5xW5yX5
zY5aZ5bA6cB6dC6eD6fE6gF6hG6iH6jI6kJ6lK6mL6nM6oN6pO6qP6rQ6sR6tS6u
T6vU6wV6xW6yX6zY6aZ6bA7cB7dC7eD7fE7gF7hG7iH7jI7kJ7lK7mL7nM7oN7p
O7qP7rQ7sR7tS7uT7vU7wV7xW7yX7zY7aZ7bA8cB8dC8eD8fE8gF8hG8iH8jI8k
J8lK8mL8nM8oN8pO8qP8rQ8sR8tS8uT8vU8wV8xW8yX8zY8aZ8bA9cB9dC9eD9f
E9gF9hG9iH9jI9kJ9lK9mL9nM9oN9pO9qP9rQ9sR9tS9uT9vU9wV9xW9yX9zY9a
Z9bAECAwEAAQ==
-----END PUBLIC KEY-----`;

    // Mock ConfigService
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
      expect(result).not.toBeNull();
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
