import { IsEmail, IsString, IsNotEmpty, MinLength, IsOptional, Matches, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ example: '+12025550123' })
  @IsString()
  @IsOptional()
  @Length(10, 32)
  phoneNumber?: string;

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
