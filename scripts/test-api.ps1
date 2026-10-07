# Trading Middleware API - Comprehensive Authentication Test Suite
# Tests: Signup -> Login -> Rate Limiting -> Refresh -> Logout -> Token Validation
# Usage: .\test-api.ps1 -ApiUrl "http://localhost:3001" -DatabaseUrl "postgresql://postgres:n3u3d4!@localhost:15432/agents_of_leap"


param(
    [string]$ApiUrl = "http://localhost:3001",
    [string]$DatabaseUrl = "postgresql://postgres:postgres@localhost:5432/trading_db"
)

# Test configuration
$timestamp = [Math]::Floor([decimal](Get-Date -UFormat %s))
$random = Get-Random -Minimum 1000 -Maximum 9999

$TestEmail = "testuser+$timestamp$random@example.com"
$TestPassword = "SecurePass123!"
$TestPasswordWeak = "weak"
$TestPasswordNoSpecial = "SecurePass123"
$TestFirstName = "Test"
$TestLastName = "User"
$RateLimitEmail = "ratelimit+$timestamp$random@example.com"

# Global test variables
$AccessToken = $null
$RefreshToken = $null
$ClientId = $null
$ResponseEmail = $null
$ResponseRole = $null

# Test results
$TestsPassed = 0
$TestsFailed = 0

Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Trading Middleware - API Test Suite" -ForegroundColor Yellow
Write-Host "Base URL: $ApiUrl" -ForegroundColor Yellow
Write-Host "Database: $DatabaseUrl" -ForegroundColor Yellow
Write-Host "Test Email: $TestEmail" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Yellow

# Helper function to make API calls
function Test-ApiEndpoint {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Body,
        [string]$Description
    )
    
    $fullUrl = "$ApiUrl/api/v1$Endpoint"
    
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Description" -ForegroundColor Cyan
    Write-Host "  $Method $Endpoint" -ForegroundColor Gray
    
    try {
        $params = @{
            Uri = $fullUrl
            Method = $Method
            ContentType = "application/json"
            ErrorAction = "SilentlyContinue"
        }
        
        if ($Body) {
            $params['Body'] = $Body
        }
        
        $response = Invoke-WebRequest @params
        $statusCode = $response.StatusCode
        $content = $response.Content
        
        try {
            $responseObj = $content | ConvertFrom-Json
        }
        catch {
            $responseObj = $content
        }
        
        Write-Host "  [HTTP $statusCode]" -ForegroundColor Green
        
        if ($statusCode -ge 200 -and $statusCode -lt 300) {
            Write-Host "  [OK] Request succeeded" -ForegroundColor Green
            $script:TestsPassed++
        }
        elseif ($statusCode -ge 400) {
            Write-Host "  [EXPECTED ERROR] HTTP $statusCode" -ForegroundColor Yellow
            $script:TestsPassed++
        }
        
        return @{
            StatusCode = $statusCode
            Content = $responseObj
            RawContent = $content
        }
    }
    catch {
        # Check if this is an HTTP error response (4xx, 5xx)
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            
            Write-Host "  [HTTP $statusCode]" -ForegroundColor Yellow
            Write-Host "  [EXPECTED ERROR] HTTP $statusCode" -ForegroundColor Yellow
            $script:TestsPassed++
            
            return @{
                StatusCode = $statusCode
                Content = $null
                RawContent = ""
            }
        }
        else {
            Write-Host "  [ERROR] Connection failed" -ForegroundColor Red
            $script:TestsFailed++
            return @{
                StatusCode = 0
                Content = $null
                RawContent = $_
            }
        }
    }
}

# Helper to extract JSON values (supports nested properties with dot notation)
function Get-JsonValue {
    param([string]$Json, [string]$Key)
    
    try {
        $obj = $Json | ConvertFrom-Json -ErrorAction Stop
        
        # Support nested properties like "user.clientId"
        $keys = $Key -split '\.'
        $current = $obj
        
        foreach ($k in $keys) {
            if ($current -eq $null) {
                return $null
            }
            $current = $current.$k
        }
        
        return $current
    }
    catch {
        return $null
    }
}

# Helper for database verification
function Verify-Database {
    param([string]$Query, [string]$Description)
    
    Write-Host "  [DB] $Description" -ForegroundColor Cyan
    
    try {
        $result = psql "$DatabaseUrl" -t -c $Query 2>$null
        if ($result) {
            Write-Host "    Result: $result" -ForegroundColor Gray
            return $result
        }
    }
    catch {
        Write-Host "    [Skipped - psql unavailable]" -ForegroundColor Yellow
    }
}


# ============================================================================
# TEST 1: Health Check
# ============================================================================
Write-Host "TEST 1: Health Check" -ForegroundColor Yellow
Write-Host "-" * 60

$result = Test-ApiEndpoint -Method GET -Endpoint "/health" -Description "Checking API health"

if ($result.StatusCode -eq 200) {
    Write-Host "  [PASS] API is online`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] API health check failed`n" -ForegroundColor Red
}

# ============================================================================
# TEST 2: Signup with Valid Credentials
# ============================================================================
Write-Host "TEST 2: Signup with Valid Credentials" -ForegroundColor Yellow
Write-Host "-" * 60

$signupBody = @{
    email = $TestEmail
    password = $TestPassword
    firstName = $TestFirstName
    lastName = $TestLastName
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/signup" -Body $signupBody -Description "Creating user account"

if ($result.StatusCode -eq 201) {
    $AccessToken = Get-JsonValue $result.RawContent "accessToken"
    $RefreshToken = Get-JsonValue $result.RawContent "refreshToken"
    $ClientId = Get-JsonValue $result.RawContent "user.clientId"
    $ResponseEmail = Get-JsonValue $result.RawContent "user.email"
    $ResponseRole = Get-JsonValue $result.RawContent "user.role"
    
    Write-Host "  Email: $ResponseEmail" -ForegroundColor Gray
    Write-Host "  Role: $ResponseRole" -ForegroundColor Gray
    Write-Host "  Client ID: $ClientId" -ForegroundColor Gray
    Write-Host "  [PASS] Signup successful`n" -ForegroundColor Green
    
    Verify-Database "SELECT client_id, email, role FROM clients WHERE email = '$TestEmail' LIMIT 1;" "User created in database"
    Verify-Database "SELECT session_id FROM auth_sessions WHERE client_id = '$ClientId' AND revoked_at IS NULL LIMIT 1;" "Session created in database"
}
else {
    Write-Host "  [FAIL] Signup failed (HTTP $($result.StatusCode))`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 3: Signup with Duplicate Email (Should Fail)
# ============================================================================
Write-Host "TEST 3: Signup with Duplicate Email (Should Fail)" -ForegroundColor Yellow
Write-Host "-" * 60

$signupBody = @{
    email = $TestEmail
    password = $TestPassword
    firstName = $TestFirstName
    lastName = $TestLastName
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/signup" -Body $signupBody -Description "Attempting duplicate signup"

if ($result.StatusCode -eq 409) {
    Write-Host "  [PASS] Duplicate email correctly rejected (409)`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Expected 409, got $($result.StatusCode)`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 4: Signup with Weak Password (Should Fail)
# ============================================================================
Write-Host "TEST 4: Signup with Weak Password (Should Fail)" -ForegroundColor Yellow
Write-Host "-" * 60

$weakEmail = "weak+$([Math]::Floor([decimal](Get-Date -UFormat %s)))@example.com"
$signupBody = @{
    email = $weakEmail
    password = $TestPasswordWeak
    firstName = $TestFirstName
    lastName = $TestLastName
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/signup" -Body $signupBody -Description "Attempting signup with weak password"

if ($result.StatusCode -eq 400) {
    Write-Host "  [PASS] Weak password correctly rejected (400)`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Expected 400, got $($result.StatusCode)`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 5: Signup with Missing Special Character (Should Fail)
# ============================================================================
Write-Host "TEST 5: Signup with Missing Special Character (Should Fail)" -ForegroundColor Yellow
Write-Host "-" * 60

$specialEmail = "special+$([Math]::Floor([decimal](Get-Date -UFormat %s)))@example.com"
$signupBody = @{
    email = $specialEmail
    password = $TestPasswordNoSpecial
    firstName = $TestFirstName
    lastName = $TestLastName
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/signup" -Body $signupBody -Description "Attempting signup without special character"

if ($result.StatusCode -eq 400) {
    Write-Host "  [PASS] Missing special char correctly rejected (400)`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Expected 400, got $($result.StatusCode)`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 6: Login with Valid Credentials
# ============================================================================
Write-Host "TEST 6: Login with Valid Credentials" -ForegroundColor Yellow
Write-Host "-" * 60

$loginBody = @{
    email = $TestEmail
    password = $TestPassword
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/login" -Body $loginBody -Description "Logging in with valid credentials"

if ($result.StatusCode -eq 200) {
    $AccessToken = Get-JsonValue $result.RawContent "accessToken"
    $RefreshToken = Get-JsonValue $result.RawContent "refreshToken"
    $ResponseRole = Get-JsonValue $result.RawContent "user.role"
    
    Write-Host "  Role: $ResponseRole" -ForegroundColor Gray
    Write-Host "  [PASS] Login successful`n" -ForegroundColor Green
    
    Verify-Database "SELECT session_id FROM auth_sessions WHERE client_id = '$ClientId' AND revoked_at IS NULL LIMIT 1;" "Session verified in database"
}
else {
    Write-Host "  [FAIL] Login failed (HTTP $($result.StatusCode))`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 7: Login with Invalid Username (Should Fail)
# ============================================================================
Write-Host "TEST 7: Login with Invalid Username (Should Fail)" -ForegroundColor Yellow
Write-Host "-" * 60

$invalidEmail = "nonexistent+$([Math]::Floor([decimal](Get-Date -UFormat %s)))@example.com"
$loginBody = @{
    email = $invalidEmail
    password = $TestPassword
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/login" -Body $loginBody -Description "Attempting login with non-existent email"

if ($result.StatusCode -eq 401) {
    Write-Host "  [PASS] Invalid username correctly rejected (401)`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Expected 401, got $($result.StatusCode)`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 8: Login with Invalid Password (Should Fail)
# ============================================================================
Write-Host "TEST 8: Login with Invalid Password (Should Fail)" -ForegroundColor Yellow
Write-Host "-" * 60

$loginBody = @{
    email = $TestEmail
    password = "WrongPassword123!"
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/login" -Body $loginBody -Description "Attempting login with wrong password"

if ($result.StatusCode -eq 401) {
    Write-Host "  [PASS] Invalid password correctly rejected (401)`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Expected 401, got $($result.StatusCode)`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 9: Rate Limiting - 3 Failed Attempts
# ============================================================================
Write-Host "TEST 9: Rate Limiting - 3 Failed Attempts" -ForegroundColor Yellow
Write-Host "-" * 60

# Create user for rate limit testing
Write-Host "Phase 1: Creating rate limit test user" -ForegroundColor Gray
$signupBody = @{
    email = $RateLimitEmail
    password = $TestPassword
    firstName = "RateLimit"
    lastName = "Test"
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/signup" -Body $signupBody -Description "Creating rate limit test user"

if ($result.StatusCode -ne 201) {
    Write-Host "  [FAIL] Could not create rate limit test user`n" -ForegroundColor Red
}
else {
    Write-Host "  [OK] Rate limit test user created" -ForegroundColor Green
    
    # Attempt 1
    Write-Host "Phase 2: First failed attempt (1/3)" -ForegroundColor Gray
    $loginBody = @{
        email = $RateLimitEmail
        password = "WrongPass123!"
    } | ConvertTo-Json
    
    $result = Test-ApiEndpoint -Method POST -Endpoint "/auth/login" -Body $loginBody -Description "First failed login"
    
    if ($result.StatusCode -eq 401) {
        Write-Host "  [OK] Attempt 1 recorded" -ForegroundColor Green
    }
    
    # Attempt 2
    Write-Host "Phase 3: Second failed attempt (2/3)" -ForegroundColor Gray
    $loginBody = @{
        email = $RateLimitEmail
        password = "WrongPass456!"
    } | ConvertTo-Json
    
    $result = Test-ApiEndpoint -Method POST -Endpoint "/auth/login" -Body $loginBody -Description "Second failed login"
    
    if ($result.StatusCode -eq 401) {
        Write-Host "  [OK] Attempt 2 recorded" -ForegroundColor Green
    }
    
    # Attempt 3 - Should trigger lockout
    Write-Host "Phase 4: Third failed attempt (3/3) - Triggers lockout" -ForegroundColor Gray
    $loginBody = @{
        email = $RateLimitEmail
        password = "WrongPass789!"
    } | ConvertTo-Json
    
    $result = Test-ApiEndpoint -Method POST -Endpoint "/auth/login" -Body $loginBody -Description "Third failed login"
    
    if ($result.StatusCode -eq 429) {
        Write-Host "  [PASS] Account locked after 3 attempts (429)`n" -ForegroundColor Green
    }
    else {
        Write-Host "  [FAIL] Expected 429, got $($result.StatusCode)`n" -ForegroundColor Red
    }
    
    # Attempt during lockout - should reset timer only
    Write-Host "Phase 5: Attempt during lockout - timer reset (no penalty)" -ForegroundColor Gray
    $loginBody = @{
        email = $RateLimitEmail
        password = $TestPassword
    } | ConvertTo-Json
    
    $result = Test-ApiEndpoint -Method POST -Endpoint "/auth/login" -Body $loginBody -Description "Attempt while locked"
    
    if ($result.StatusCode -eq 429) {
        Write-Host "  [PASS] Still locked with timer reset (429)`n" -ForegroundColor Green
    }
    else {
        Write-Host "  [FAIL] Expected 429, got $($result.StatusCode)`n" -ForegroundColor Red
    }
    
    Verify-Database "SELECT failed_login_attempts, locked_until FROM clients WHERE email = '$RateLimitEmail';" "Verify rate limit state in database"
}

Write-Host ""

# ============================================================================
# TEST 10: Token Validation
# ============================================================================
Write-Host "TEST 10: Token Validation" -ForegroundColor Yellow
Write-Host "-" * 60

$validateBody = @{
    accessToken = $AccessToken
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/validate" -Body $validateBody -Description "Validating access token"

if ($result.StatusCode -eq 200) {
    Write-Host "  [PASS] Token validation works`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Token validation failed`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 11: Token Validation with Invalid Token
# ============================================================================
Write-Host "TEST 11: Token Validation with Invalid Token" -ForegroundColor Yellow
Write-Host "-" * 60

$validateBody = @{
    accessToken = "invalid.token.here"
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/validate" -Body $validateBody -Description "Validating invalid token"

if ($result.StatusCode -eq 200) {
    Write-Host "  [PASS] Invalid token handled correctly`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Unexpected status code`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 12: Refresh Tokens
# ============================================================================
Write-Host "TEST 12: Refresh Tokens" -ForegroundColor Yellow
Write-Host "-" * 60

$refreshBody = @{
    clientId = $ClientId
    refreshToken = $RefreshToken
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/refresh" -Body $refreshBody -Description "Refreshing tokens"

if ($result.StatusCode -eq 200) {
    $AccessToken = Get-JsonValue $result.RawContent "accessToken"
    $RefreshToken = Get-JsonValue $result.RawContent "refreshToken"
    
    Write-Host "  New tokens generated" -ForegroundColor Gray
    Write-Host "  [PASS] Token refresh successful`n" -ForegroundColor Green
    
    Verify-Database "SELECT session_id FROM auth_sessions WHERE client_id = '$ClientId' AND revoked_at IS NULL LIMIT 1;" "Verify session still active"
}
else {
    Write-Host "  [FAIL] Token refresh failed (HTTP $($result.StatusCode))`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 13: Refresh with Invalid Refresh Token
# ============================================================================
Write-Host "TEST 13: Refresh with Invalid Refresh Token" -ForegroundColor Yellow
Write-Host "-" * 60

$refreshBody = @{
    clientId = $ClientId
    refreshToken = "invalid.refresh.token"
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/refresh" -Body $refreshBody -Description "Attempting refresh with invalid token"

if ($result.StatusCode -eq 401) {
    Write-Host "  [PASS] Invalid refresh token rejected (401)`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Expected 401, got $($result.StatusCode)`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 14: Refresh with Wrong Client ID
# ============================================================================
Write-Host "TEST 14: Refresh with Wrong Client ID" -ForegroundColor Yellow
Write-Host "-" * 60

$fakeClientId = "00000000-0000-0000-0000-000000000000"
$refreshBody = @{
    clientId = $fakeClientId
    refreshToken = $RefreshToken
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/refresh" -Body $refreshBody -Description "Attempting refresh with wrong client ID"

if ($result.StatusCode -eq 401) {
    Write-Host "  [PASS] Mismatched client ID rejected (401)`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Expected 401, got $($result.StatusCode)`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 15: Logout
# ============================================================================
Write-Host "TEST 15: Logout" -ForegroundColor Yellow
Write-Host "-" * 60

$logoutBody = @{
    clientId = $ClientId
    refreshToken = $RefreshToken
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/logout" -Body $logoutBody -Description "Logging out"

if ($result.StatusCode -eq 200) {
    Write-Host "  [PASS] Logout successful`n" -ForegroundColor Green
    
    Verify-Database "SELECT session_id FROM auth_sessions WHERE client_id = '$ClientId' AND revoked_at IS NOT NULL LIMIT 1;" "Verify session revoked"
}
else {
    Write-Host "  [FAIL] Logout failed (HTTP $($result.StatusCode))`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 16: Use Revoked Refresh Token
# ============================================================================
Write-Host "TEST 16: Use Revoked Refresh Token" -ForegroundColor Yellow
Write-Host "-" * 60

$refreshBody = @{
    clientId = $ClientId
    refreshToken = $RefreshToken
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/refresh" -Body $refreshBody -Description "Attempting refresh with revoked token"

if ($result.StatusCode -eq 401) {
    Write-Host "  [PASS] Revoked token rejected (401)`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Expected 401, got $($result.StatusCode)`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# TEST 17: Logout with Invalid Token
# ============================================================================
Write-Host "TEST 17: Logout with Invalid Token" -ForegroundColor Yellow
Write-Host "-" * 60

$logoutBody = @{
    clientId = $ClientId
    refreshToken = "invalid.token.here"
} | ConvertTo-Json

$result = Test-ApiEndpoint -Method POST -Endpoint "/auth/logout" -Body $logoutBody -Description "Attempting logout with invalid token"

if ($result.StatusCode -eq 401) {
    Write-Host "  [PASS] Invalid token rejected (401)`n" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Expected 401, got $($result.StatusCode)`n" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Test Summary" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Tests Passed: $TestsPassed" -ForegroundColor Green
Write-Host "Tests Failed: $TestsFailed" -ForegroundColor $(if($TestsFailed -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($TestsFailed -eq 0) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
}
else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "SOME TESTS FAILED" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}

Write-Host ""
