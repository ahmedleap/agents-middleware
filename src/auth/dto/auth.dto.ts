import { IsEmail, IsString, IsNotEmpty, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string = '';

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string = '';
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
  accessToken: string = '';

  @IsString()
  @IsOptional()
  refreshToken?: string;
}
