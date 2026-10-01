# Backend API Assumptions

This document outlines the expected API contracts between the middleware and the Java backend.

## Overview

The middleware acts as an edge layer and delegates all business logic and data persistence to the Java backend. The backend must provide specific endpoints as documented below.

## Authentication Endpoints

### 1. Login Endpoint

**Endpoint:** `POST /auth/login`

**Purpose:** Authenticate user with email and password. Returns user information for token generation.

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
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "CLIENT",
  "accounts": [
    {
      "accountId": "650e8400-e29b-41d4-a716-446655440000",
      "name": "Main Account",
      "cashBalance": 10000.00,
      "status": "ACTIVE"
    }
  ],
  "portfolioValue": 50000.00
}
```

**Error Responses:**

- **401 Unauthorized:** Invalid credentials
  ```json
  {
    "statusCode": 401,
    "message": "Invalid email or password",
    "error": "Unauthorized"
  }
  ```

- **404 Not Found:** User not found
  ```json
  {
    "statusCode": 404,
    "message": "User not found",
    "error": "Not Found"
  }
  ```

- **400 Bad Request:** Invalid input
  ```json
  {
    "statusCode": 400,
    "message": "Invalid email format",
    "error": "Bad Request"
  }
  ```

**Implementation Notes:**
- Validate email format
- Hash and validate password against stored hash
- Return basic user info (NO passwords/secrets)
- Include account information if available
- Return portfolio value placeholder for dashboard

---

### 2. Token Refresh Endpoint

**Endpoint:** `POST /auth/refresh`

**Purpose:** Validate refresh token and update it in the database. Called when the current refresh token is about to expire.

**Request:**
```json
{
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "refreshTokenUpdated": true,
  "newRefreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**

- **401 Unauthorized:** Invalid or expired refresh token
  ```json
  {
    "statusCode": 401,
    "message": "Refresh token invalid or expired",
    "error": "Unauthorized"
  }
  ```

- **404 Not Found:** Client not found
  ```json
  {
    "statusCode": 404,
    "message": "Client not found",
    "error": "Not Found"
  }
  ```

**Implementation Notes:**
- Validate refresh token against what's stored in the database
- Check token expiration
- Update the refresh token in the database
- Do NOT return the old token
- Return new refresh token for the next rotation

**Database Schema Reference:**
```sql
-- Expected column in clients table
ALTER TABLE clients ADD COLUMN refresh_token VARCHAR(500);
```

---

### 3. User Info Endpoint

**Endpoint:** `GET /users/{clientId}`

**Purpose:** Fetch detailed user information including dashboard data.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Response (200 OK):**
```json
{
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "CLIENT",
  "dateOfJoin": "2024-01-01T00:00:00Z",
  "accounts": [
    {
      "accountId": "650e8400-e29b-41d4-a716-446655440000",
      "name": "Main Account",
      "cashBalance": 10000.00,
      "status": "ACTIVE",
      "openDate": "2024-01-01T00:00:00Z"
    }
  ],
  "portfolioValue": 50000.00,
  "holdings": [
    {
      "instrumentId": "750e8400-e29b-41d4-a716-446655440000",
      "ticker": "AAPL",
      "quantity": 100,
      "currentValue": 15000
    }
  ]
}
```

**Error Responses:**

- **401 Unauthorized:** Invalid or missing access token
  ```json
  {
    "statusCode": 401,
    "message": "Invalid access token",
    "error": "Unauthorized"
  }
  ```

- **403 Forbidden:** User accessing another user's data
  ```json
  {
    "statusCode": 403,
    "message": "Access denied",
    "error": "Forbidden"
  }
  ```

- **404 Not Found:** User not found
  ```json
  {
    "statusCode": 404,
    "message": "User not found",
    "error": "Not Found"
  }
  ```

**Implementation Notes:**
- Verify access token from Authorization header
- Validate that the clientId in the token matches the requested user
- Return comprehensive user profile
- Include all accounts
- Calculate and return portfolio value
- Include holdings for dashboard display

---

### 4. Logout Endpoint

**Endpoint:** `POST /auth/logout`

**Purpose:** Clear/invalidate the refresh token stored in the database when user logs out.

**Request:**
```json
{
  "clientId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Refresh token cleared"
}
```

**Error Responses:**

- **404 Not Found:** User not found (optional - can return 200 for graceful degradation)
  ```json
  {
    "statusCode": 404,
    "message": "User not found",
    "error": "Not Found"
  }
  ```

- **500 Internal Server Error:** Database error
  ```json
  {
    "statusCode": 500,
    "message": "Failed to clear refresh token",
    "error": "Internal Server Error"
  }
  ```

**Implementation Notes:**
- Set the `refresh_token` column to `NULL` in the clients table for the given clientId
- If the endpoint doesn't exist, middleware will handle gracefully
- This endpoint is called when user logs out
- The middleware already invalidates the access token on its side
- Return 200 OK even if user not found (graceful logout)

---


## Error Handling Guidelines

### Standard Error Response Format

All error responses should follow this format:

```json
{
  "statusCode": 400,
  "timestamp": "2024-09-30T12:00:00.000Z",
  "path": "/auth/login",
  "message": "Detailed error message",
  "error": "ErrorType"
}
```

### HTTP Status Codes

- `200 OK`: Successful request
- `400 Bad Request`: Malformed request
- `401 Unauthorized`: Invalid credentials or token
- `403 Forbidden`: Access denied (valid token, but insufficient permissions)
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Database or service unavailable

---

## Authentication Flow

### Login Flow

```
1. Client sends email + password
2. Backend validates credentials
3. Backend returns user info + accounts
4. Middleware generates tokens
5. Middleware returns accessToken + refreshToken to client
```

### Token Refresh Flow

```
1. Client detects accessToken about to expire
2. Client sends refreshToken to middleware
3. Middleware verifies refreshToken
4. Middleware calls backend to update token
5. Backend validates and updates refresh token in DB
6. Backend returns confirmation
7. Middleware generates new token pair
8. Middleware returns new tokens to client
```

### Access Flow

```
1. Client makes request with accessToken in Authorization header
2. Middleware validates accessToken
3. Middleware forwards request to backend (if needed)
4. Backend processes request using token info
5. Backend returns response
```

---

## Database Schema Reference

Based on the provided `schema.sql`, the middleware expects:

### Clients Table

```sql
CREATE TABLE clients (
    client_id UUID PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    refresh_token VARCHAR(500),  -- For storing refresh token
    -- ... other fields
);
```

### Key Fields

- `client_id`: Unique identifier (UUID)
- `email`: User email (used for login)
- `password_hash`: Hashed password (never return this)
- `first_name`, `last_name`: User name
- `refresh_token`: Current refresh token value

---

## Testing the Integration

### 1. Test Login

```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 2. Test Token Refresh

```bash
curl -X POST http://localhost:8080/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "550e8400-e29b-41d4-a716-446655440000",
    "refreshToken": "eyJhbGci..."
  }'
```

### 3. Test User Info

```bash
curl -X GET http://localhost:8080/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJhbGci..."
```

### 4. Test Logout

```bash
curl -X POST http://localhost:8080/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

---

## Implementation Checklist

- [ ] Implement POST /auth/login endpoint
- [ ] Implement POST /auth/refresh endpoint
- [ ] Implement GET /users/{userId} endpoint
- [ ] Implement POST /auth/logout endpoint
- [ ] Add refresh_token column to clients table
- [ ] Hash passwords securely (bcrypt recommended)
- [ ] Validate input parameters
- [ ] Return proper error codes
- [ ] Test with middleware
- [ ] Document any deviations from these specs
- [ ] Set up integration tests

---

## Notes

- All timestamps should be in ISO 8601 format (UTC)
- All IDs should be UUIDs
- Passwords should never be returned
- Access tokens are validated by the middleware (no backend validation needed)
- Refresh tokens are stored in the database and validated by the backend

## Future Enhancements

- Two-factor authentication (2FA)
- OAuth2 integration
- Permission-based access control
- API key authentication for service-to-service communication
- Token blacklisting for revocation
