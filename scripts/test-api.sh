#!/bin/bash

# Trading Middleware API Integration Test Script
# This script tests all authentication endpoints: signup, login, refresh, logout
# Usage: ./test-api.sh <API_URL> [DATABASE_IP:PORT]
# Example: ./test-api.sh http://localhost:3001 localhost:5432

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${1:-http://localhost:3001}"
DB_CONNECTION="${2:-localhost:5432}"
API_PREFIX="/api/v1"
TEST_EMAIL="testuser+$(date +%s)@example.com"
TEST_PASSWORD="SecurePass123!"
TEST_FIRST_NAME="Test"
TEST_LAST_NAME="User"

# Results tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
    ((TESTS_PASSED++))
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
    ((TESTS_FAILED++))
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Test health check
test_health() {
    print_header "TEST 1: Health Check"
    print_info "Testing API connectivity..."
    
    response=$(curl -s -w "\n%{http_code}" "$API_URL$API_PREFIX/health")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        print_success "Health check passed (HTTP 200)"
        print_info "Response: $body"
    else
        print_error "Health check failed (HTTP $http_code)"
        return 1
    fi
}

# Test signup
test_signup() {
    print_header "TEST 2: Signup Endpoint"
    print_info "Creating new user: $TEST_EMAIL"
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL$API_PREFIX/auth/signup" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$TEST_EMAIL\",
            \"password\": \"$TEST_PASSWORD\",
            \"firstName\": \"$TEST_FIRST_NAME\",
            \"lastName\": \"$TEST_LAST_NAME\"
        }")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 201 ]; then
        print_success "Signup successful (HTTP 201)"
        print_info "Response: $body"
        
        # Extract tokens
        ACCESS_TOKEN=$(echo "$body" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        REFRESH_TOKEN=$(echo "$body" | grep -o '"refreshToken":"[^"]*' | cut -d'"' -f4)
        CLIENT_ID=$(echo "$body" | grep -o '"clientId":"[^"]*' | cut -d'"' -f4)
        
        if [ -z "$ACCESS_TOKEN" ] || [ -z "$REFRESH_TOKEN" ] || [ -z "$CLIENT_ID" ]; then
            print_error "Failed to extract tokens from response"
            return 1
        fi
        
        print_success "Tokens extracted successfully"
        print_info "Access Token: ${ACCESS_TOKEN:0:50}..."
        print_info "Refresh Token: ${REFRESH_TOKEN:0:50}..."
        print_info "Client ID: $CLIENT_ID"
        
        # Export for next tests
        export ACCESS_TOKEN REFRESH_TOKEN CLIENT_ID
    else
        print_error "Signup failed (HTTP $http_code)"
        print_info "Response: $body"
        return 1
    fi
}

# Test login
test_login() {
    print_header "TEST 3: Login Endpoint"
    print_info "Logging in with: $TEST_EMAIL"
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL$API_PREFIX/auth/login" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$TEST_EMAIL\",
            \"password\": \"$TEST_PASSWORD\"
        }")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        print_success "Login successful (HTTP 200)"
        print_info "Response: $body"
        
        # Extract tokens
        LOGIN_ACCESS_TOKEN=$(echo "$body" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        LOGIN_REFRESH_TOKEN=$(echo "$body" | grep -o '"refreshToken":"[^"]*' | cut -d'"' -f4)
        LOGIN_CLIENT_ID=$(echo "$body" | grep -o '"clientId":"[^"]*' | cut -d'"' -f4)
        
        if [ -z "$LOGIN_ACCESS_TOKEN" ] || [ -z "$LOGIN_REFRESH_TOKEN" ]; then
            print_error "Failed to extract tokens from login response"
            return 1
        fi
        
        print_success "Login tokens extracted successfully"
        print_info "Access Token: ${LOGIN_ACCESS_TOKEN:0:50}..."
        print_info "Refresh Token: ${LOGIN_REFRESH_TOKEN:0:50}..."
        
        # Update global tokens for subsequent tests
        export ACCESS_TOKEN="$LOGIN_ACCESS_TOKEN"
        export REFRESH_TOKEN="$LOGIN_REFRESH_TOKEN"
        export CLIENT_ID="$LOGIN_CLIENT_ID"
    else
        print_error "Login failed (HTTP $http_code)"
        print_info "Response: $body"
        return 1
    fi
}

# Test validate token
test_validate_token() {
    print_header "TEST 4: Token Validation Endpoint"
    print_info "Validating access token..."
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL$API_PREFIX/auth/validate" \
        -H "Content-Type: application/json" \
        -d "{
            \"accessToken\": \"$ACCESS_TOKEN\"
        }")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        print_success "Token validation successful (HTTP 200)"
        print_info "Response: $body"
        
        # Check if token is valid
        if echo "$body" | grep -q '"valid":true'; then
            print_success "Access token is valid"
        else
            print_warning "Access token validation returned false"
        fi
    else
        print_error "Token validation failed (HTTP $http_code)"
        print_info "Response: $body"
        return 1
    fi
}

# Test refresh token
test_refresh() {
    print_header "TEST 5: Refresh Token Endpoint"
    print_info "Refreshing tokens with clientId: $CLIENT_ID"
    print_info "Current Refresh Token: ${REFRESH_TOKEN:0:50}..."
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL$API_PREFIX/auth/refresh" \
        -H "Content-Type: application/json" \
        -d "{
            \"clientId\": \"$CLIENT_ID\",
            \"refreshToken\": \"$REFRESH_TOKEN\"
        }")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        print_success "Token refresh successful (HTTP 200)"
        print_info "Response: $body"
        
        # Extract new tokens
        NEW_ACCESS_TOKEN=$(echo "$body" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        NEW_REFRESH_TOKEN=$(echo "$body" | grep -o '"refreshToken":"[^"]*' | cut -d'"' -f4)
        
        if [ -z "$NEW_ACCESS_TOKEN" ] || [ -z "$NEW_REFRESH_TOKEN" ]; then
            print_error "Failed to extract new tokens from refresh response"
            return 1
        fi
        
        print_success "New tokens generated successfully"
        print_info "New Access Token: ${NEW_ACCESS_TOKEN:0:50}..."
        print_info "New Refresh Token: ${NEW_REFRESH_TOKEN:0:50}..."
        
        # Verify tokens are different
        if [ "$ACCESS_TOKEN" != "$NEW_ACCESS_TOKEN" ]; then
            print_success "New access token is different from old one"
        else
            print_warning "New access token is the same as old one"
        fi
        
        # Update tokens for logout test
        export ACCESS_TOKEN="$NEW_ACCESS_TOKEN"
        export REFRESH_TOKEN="$NEW_REFRESH_TOKEN"
    else
        print_error "Token refresh failed (HTTP $http_code)"
        print_info "Response: $body"
        return 1
    fi
}

# Test logout
test_logout() {
    print_header "TEST 6: Logout Endpoint"
    print_info "Logging out with clientId: $CLIENT_ID"
    print_info "Using Refresh Token: ${REFRESH_TOKEN:0:50}..."
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL$API_PREFIX/auth/logout" \
        -H "Content-Type: application/json" \
        -d "{
            \"clientId\": \"$CLIENT_ID\",
            \"refreshToken\": \"$REFRESH_TOKEN\"
        }")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        print_success "Logout successful (HTTP 200)"
        print_info "Response: $body"
    else
        print_error "Logout failed (HTTP $http_code)"
        print_info "Response: $body"
        return 1
    fi
}

# Test logout verification (should fail)
test_logout_verification() {
    print_header "TEST 7: Verify Token Revoked After Logout"
    print_info "Attempting to refresh with revoked token (should fail)..."
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL$API_PREFIX/auth/refresh" \
        -H "Content-Type: application/json" \
        -d "{
            \"clientId\": \"$CLIENT_ID\",
            \"refreshToken\": \"$REFRESH_TOKEN\"
        }")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 401 ]; then
        print_success "Revoked token correctly rejected (HTTP 401)"
        print_info "Response: $body"
    else
        print_error "Revoked token should have been rejected but wasn't (HTTP $http_code)"
        print_info "Response: $body"
        return 1
    fi
}

# Main execution
main() {
    print_header "Trading Middleware API Integration Test Suite"
    print_info "API URL: $API_URL"
    print_info "Database: $DB_CONNECTION"
    print_info "Test Email: $TEST_EMAIL"
    echo ""
    
    # Check if API is reachable
    if ! timeout 5 bash -c "echo > /dev/tcp/${API_URL#http://}" 2>/dev/null; then
        print_warning "API URL may not be reachable, but continuing tests..."
    fi
    
    # Run tests
    test_health || return 1
    echo ""
    test_signup || return 1
    echo ""
    test_login || return 1
    echo ""
    test_validate_token || true  # Non-critical
    echo ""
    test_refresh || return 1
    echo ""
    test_logout || return 1
    echo ""
    test_logout_verification || return 1
    
    # Summary
    echo ""
    print_header "Test Summary"
    print_info "Tests Passed: $TESTS_PASSED"
    print_info "Tests Failed: $TESTS_FAILED"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}All tests passed! ✓${NC}"
        echo -e "${GREEN}========================================${NC}"
        return 0
    else
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}Some tests failed! ✗${NC}"
        echo -e "${RED}========================================${NC}"
        return 1
    fi
}

# Run main function
main
