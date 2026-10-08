import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { LoginDto, SignupDto, RefreshTokenDto, LogoutDto } from '../dto/auth.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() signupDto: SignupDto) {
    this.logger.debug(`Signup attempt for email: ${signupDto.email}`);
    return this.authService.signup(
      signupDto.email,
      signupDto.password,
      signupDto.firstName,
      signupDto.lastName,
      signupDto.dateOfBirth,
      signupDto.phoneNumber,
      signupDto.country,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    this.logger.debug(`Login attempt for email: ${loginDto.email}`);
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    this.logger.debug(`Token refresh for client: ${refreshTokenDto.clientId}`);
    return this.authService.refresh(
      refreshTokenDto.clientId,
      refreshTokenDto.refreshToken,
    );
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validateToken(@Body('accessToken') accessToken: string) {
    const isValid = this.authService.validateAccessToken(accessToken);
    return { valid: isValid };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() logoutDto: LogoutDto) {
    await this.authService.logout(logoutDto.clientId, logoutDto.refreshToken);
    return { message: 'Logout successful', success: true };
  }
}
