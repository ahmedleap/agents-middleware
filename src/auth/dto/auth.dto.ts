import { IsEmail, IsString, IsNotEmpty, MinLength, IsOptional, Matches, Length, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Same values as the clients.risk_tolerance / clients.portfolio_size_range Postgres enums
export const RISK_TOLERANCES = ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'] as const;
export const PORTFOLIO_SIZE_RANGES = [
  'UNDER_50K',
  'BETWEEN_50K_100K',
  'BETWEEN_100K_200K',
  'BETWEEN_200K_500K',
  'OVER_500K',
] as const;
export type RiskTolerance = (typeof RISK_TOLERANCES)[number];
export type PortfolioSizeRange = (typeof PORTFOLIO_SIZE_RANGES)[number];

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string = '';

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string = '';
}

export class StaffLoginDto {
  @ApiProperty({ example: 'analyst@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string = '';

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string = '';
}

export class SignupDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string = '';

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain uppercase, lowercase, number, and special character',
  })
  password: string = '';

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  firstName: string = '';

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string = '';

  @ApiProperty({ example: '1990-01-15', description: 'ISO 8601 date string (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  dateOfBirth: string = ''; // ISO 8601 date string (YYYY-MM-DD) - REQUIRED

  @ApiProperty({ example: '123-45-6789', description: 'US Social Security number; only the last four digits are stored' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{3}-?\d{2}-?\d{4}$/, {
    message: 'SSN must contain 9 digits in the format 123-45-6789 or 123456789',
  })
  ssn: string = '';

  @ApiProperty({ example: 'MODERATE', enum: RISK_TOLERANCES })
  @IsIn(RISK_TOLERANCES, { message: `riskTolerance must be one of: ${RISK_TOLERANCES.join(', ')}` })
  // Empty default (like the other fields) so a missing value fails @IsIn instead of being filled in
  riskTolerance: RiskTolerance = '' as RiskTolerance;

  @ApiProperty({ example: 'BETWEEN_50K_100K', enum: PORTFOLIO_SIZE_RANGES })
  @IsIn(PORTFOLIO_SIZE_RANGES, { message: `portfolioSizeRange must be one of: ${PORTFOLIO_SIZE_RANGES.join(', ')}` })
  portfolioSizeRange: PortfolioSizeRange = '' as PortfolioSizeRange;

  @ApiPropertyOptional({ example: 'US', description: 'ISO 2-letter country code' })
  @IsString()
  @IsOptional()
  @Length(2, 2)
  country?: string; // ISO 2-letter country code
}

export class RefreshTokenDto {
  @ApiProperty({ example: 'a5b0a27c-41dc-4fd1-a98b-f2d6f2d46e62' })
  @IsString()
  @IsNotEmpty()
  clientId: string = '';

  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string = '';
}

export class LogoutDto {
  @ApiProperty({ example: 'a5b0a27c-41dc-4fd1-a98b-f2d6f2d46e62' })
  @IsString()
  @IsNotEmpty()
  clientId: string = '';

  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string = '';
}
