# Trading Middleware - NestJS Authentication Service

A production-grade NestJS middleware service that acts as an authentication and authorization layer between an Angular frontend and a Java/Spring backend for a trading platform.

## Overview

This middleware service provides:

- **JWT-based Authentication**: Secure token generation and management
- **Token Rotation**: Both access and refresh tokens rotate every 15 minutes for enhanced security
- **Rate Limiting**: Prevents brute-force attacks with 3-strike lockout mechanism
- **Backend Integration**: Communicates with Java backend for user verification
- **Dashboard Data**: Returns customer-specific information (accounts, portfolio values, etc.)
- **CORS Management**: Configured for Angular frontend communication
- **Production-Ready**: Docker, Jenkins pipeline, comprehensive tests (80%+ coverage)

## Architecture

```
┌──────────────┐
│ Angular App  │
└──────┬───────┘
       │ HTTPS
       ▼
┌──────────────────────────────────────┐
│ NestJS Middleware (This Service)     │
│  - Authentication                    │
│  - Token Management                  │
│  - Rate Limiting                     │
│  - Request/Response Transformation   │
└──────┬───────────────────────────────┘
       │ HTTP
       ▼
┌──────────────────────────────────────┐
│ Java Spring Backend                  │
│  - Business Logic                    │
│  - Database Operations               │
│  - Data Persistence                  │
└──────────────────────────────────────┘
```

## Prerequisites

- **Node.js**: 20 LTS (or higher)
- **npm**: 9+ or yarn
- **Docker**: 20.10+ (for containerization)
- **Java Backend**: Running on `http://localhost:8080`
- **PostgreSQL**: (for backend database)

## Installation

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd trading-middleware
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the development server**
   ```bash
   npm run start:dev
   ```

   The service will be available at `http://localhost:3001/api/v1`

### Docker

1. **Build the Docker image**
   ```bash
   docker build -t trading-middleware:latest .
   ```

2. **Run with docker-compose**
   ```bash
   docker-compose up -d
   ```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Application
NODE_ENV=development
PORT=3001
API_PREFIX=api/v1

# Backend Service
BACKEND_BASE_URL=http://localhost:8080
BACKEND_LOGIN_ENDPOINT=/auth/login
BACKEND_REFRESH_ENDPOINT=/auth/refresh
BACKEND_USER_ENDPOINT=/users/{userId}
BACKEND_TIMEOUT_MS=30000

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_ACCESS_TOKEN_EXPIRY=900          # 15 minutes
JWT_REFRESH_TOKEN_EXPIRY=900         # 15 minutes

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000          # 15 minutes
RATE_LIMIT_MAX_ATTEMPTS=3
RATE_LIMIT_LOCKOUT_DURATION_MS=900000 # 15 minutes

# CORS
CORS_ORIGIN=http://localhost:4200
CORS_CREDENTIALS=true
```

## API Endpoints

### Authentication

#### POST `/api/v1/auth/login`
Login user with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "expiresIn": 900,
  "user": {
    "clientId": "uuid-123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "CLIENT"
  },
  "dashboard": {
    "accounts": [
      {
        "accountId": "acc-uuid",
        "name": "Main Account",
        "cashBalance": 10000,
        "status": "ACTIVE"
      }
    ],
    "portfolioValue": 50000
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid email or password format
- `401 Unauthorized`: Invalid credentials
- `404 Not Found`: User not found
- `429 Too Many Requests`: Account locked due to failed attempts
- `503 Service Unavailable`: Backend service unavailable

#### POST `/api/v1/auth/refresh`
Refresh access and refresh tokens.

**Request:**
```json
{
  "clientId": "uuid-123",
  "refreshToken": "eyJhbGci..."
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "expiresIn": 900
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or expired refresh token
- `400 Bad Request`: Client ID mismatch

#### POST `/api/v1/auth/validate`
Validate an access token.

**Request:**
```json
{
  "accessToken": "eyJhbGci..."
}
```

**Response (200 OK):**
```json
{
  "valid": true
}
```

#### POST `/api/v1/auth/logout`
Logout user (clears client-side tokens).

**Request:**
```json
{
  "clientId": "uuid-123"
}
```

**Response (200 OK):**
```json
{
  "message": "Logout successful"
}
```

### Health Check

#### GET `/api/v1/health`
Check service health status.

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2024-09-30T12:00:00.000Z",
  "uptime": 3600
}
```

## Development

### Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:cov
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run typecheck
```

### Build

```bash
# Production build
npm run build

# Output will be in ./dist directory
```

## Testing

### Test Coverage

The project maintains **>80% code coverage** including:

- **Unit Tests**: Services, controllers, utilities
- **Integration Tests**: Service-to-service communication
- **Test Files**:
  - `src/auth/services/*.spec.ts`
  - `src/auth/controllers/*.spec.ts`

### Running Tests

```bash
# Run all tests once
npm run test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:cov

# View coverage report
open coverage/index.html
```

## Rate Limiting

The service implements a 3-strike rate limiter for login attempts:

1. **First 2 Failed Attempts**: Allowed with recorded failures
2. **3rd Failed Attempt**: Account locked for 15 minutes
3. **Lock Duration**: 15 minutes (configurable via `RATE_LIMIT_LOCKOUT_DURATION_MS`)

### Example Lockout Response

```json
{
  "statusCode": 429,
  "timestamp": "2024-09-30T12:00:00.000Z",
  "path": "/api/v1/auth/login",
  "message": "Account locked due to too many failed login attempts. Try again in 900 seconds."
}
```

## Security Features

- **JWT Tokens**: Cryptographically signed tokens with expiration
- **Token Rotation**: Both access and refresh tokens rotate every 15 minutes
- **Rate Limiting**: Prevents brute-force attacks on login
- **CORS**: Configured for specific origins (configurable)
- **Secure Headers**: Recommended for production (via reverse proxy)
- **No Database Connection**: Middleware doesn't access database directly
- **Environment Secrets**: Sensitive data stored in environment variables

## Docker Deployment

### Build

```bash
docker build -t trading-middleware:latest .
```

### Run

```bash
docker run -p 3001:3001 \
  -e BACKEND_BASE_URL=http://host.docker.internal:8080 \
  -e JWT_SECRET=your-secret \
  trading-middleware:latest
```

### Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f trading-middleware

# Stop services
docker-compose down
```

## CI/CD Pipeline

### Jenkins Pipeline

The `Jenkinsfile` defines a complete CI/CD pipeline:

1. **Checkout**: Clone repository
2. **Setup**: Verify Node.js environment
3. **Install**: Install dependencies
4. **Lint**: Code quality checks
5. **Type Check**: TypeScript validation
6. **Test**: Unit tests with coverage (80% threshold)
7. **Build**: Compile TypeScript
8. **Docker Build**: Create Docker image
9. **Docker Push**: Push to registry (main branch only)
10. **Deploy**: Deploy to production (configurable)
11. **Smoke Tests**: Verify deployment health

### Pipeline Triggers

- On commit to any branch
- Automated Docker push on main branch
- Coverage reports published to Jenkins

### Running Locally

```bash
# Simulate Jenkins pipeline locally
./gradlew test
npm run test:cov
npm run build
docker build -t trading-middleware:local .
```

## Backend Integration

### Assumptions

The middleware assumes the following backend endpoints exist. **Document any changes to these endpoints**:

1. **POST /auth/login**
   - Authenticates user with email and password
   - Returns: `{ clientId, email, firstName, lastName, role?, accounts?, portfolioValue? }`

2. **POST /auth/refresh**
   - Validates and updates refresh token
   - Returns: `{ clientId, refreshTokenUpdated, newRefreshToken? }`

3. **GET /users/{userId}**
   - Fetches user information (with Authorization header)
   - Returns: User data with dashboard information

## Project Structure

```
trading-middleware/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── app.module.ts           # Root module
│   ├── auth/
│   │   ├── auth.module.ts      # Auth module
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   └── auth.controller.spec.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── jwt-token.service.ts
│   │   │   ├── rate-limit.service.ts
│   │   │   ├── backend-integration.service.ts
│   │   │   └── *.spec.ts       # Unit tests
│   │   ├── dto/
│   │   │   └── auth.dto.ts     # Request/response DTOs
│   │   └── index.ts
│   ├── config/
│   │   └── config.service.ts   # Environment configuration
│   ├── common/
│   │   └── filters/
│   │       └── http-exception.filter.ts
│   └── health/
│       └── health.controller.ts
├── test/
│   └── jest-e2e.json           # E2E test config
├── Dockerfile                  # Production Docker image
├── docker-compose.yml          # Local development compose
├── Jenkinsfile                 # CI/CD pipeline
├── .env.example                # Environment template
├── .dockerignore
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### Connection Refused to Backend

**Error**: `Backend service unavailable`

**Solution**: Ensure Java backend is running on the configured URL:
```bash
curl http://localhost:8080/health
```

### Rate Limit Locked

**Error**: `Account locked due to too many failed login attempts`

**Solution**: Wait for lockout duration (default 15 minutes) or restart the service.

### JWT Secret Not Configured

**Error**: `JWT_SECRET is not configured`

**Solution**: Add `JWT_SECRET` to `.env`:
```bash
echo "JWT_SECRET=your-secure-secret-key" >> .env
```

### Port Already in Use

**Error**: `listen EADDRINUSE: address already in use :::3001`

**Solution**: 
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Or use different port
PORT=3002 npm run start
```

## Performance Considerations

- **Token Expiry**: 15 minutes (configurable)
- **Rate Limit Window**: 15 minutes (configurable)
- **Backend Timeout**: 30 seconds (configurable)
- **In-Memory State**: Rate limit data stored in-memory (consider Redis for distributed systems)

## Production Deployment Checklist

- [ ] Set strong `JWT_SECRET` (minimum 32 characters)
- [ ] Update `CORS_ORIGIN` to match frontend domain
- [ ] Enable HTTPS with reverse proxy (nginx/Apache)
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy for refresh tokens
- [ ] Set up alerting for failed authentication attempts
- [ ] Test rate limiting behavior
- [ ] Verify backend connectivity
- [ ] Load test the service
- [ ] Set up health check monitoring

## License

Proprietary - Trading Platform

## Support

For issues or questions:
1. Check troubleshooting section
2. Review server logs: `npm run start:dev`
3. Check backend connectivity
4. Verify environment configuration

## Contributing

1. Follow existing code style
2. Write tests for new features
3. Maintain >80% code coverage
4. Update documentation
5. Commit with clear messages
