import { IsEmail, IsString, IsNotEmpty, MinLength, IsOptional, Matches, Length } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string = '';

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string = '';
}

export class SignupDto {
  @IsEmail()
  @IsNotEmpty()
  email: string = '';

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain uppercase, lowercase, number, and special character',
  })
  password: string = '';

  @IsString()
  @IsNotEmpty()
  firstName: string = '';

  @IsString()
  @IsNotEmpty()
  lastName: string = '';

  @IsString()
  @IsOptional()
  @Length(10, 32)
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  @Length(2, 2)
  country?: string; // ISO 2-letter country code
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  clientId: string = '';

  @IsString()
  @IsNotEmpty()
  refreshToken: string = '';
}

export class LogoutDto {
  @IsString()
  @IsNotEmpty()
  clientId: string = '';

  @IsString()
  @IsNotEmpty()
  refreshToken: string = '';
}
