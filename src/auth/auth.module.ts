import { Module } from '@nestjs/common';
import { AuthService } from './services/auth.service';
import { JwtTokenService } from './services/jwt-token.service';
import { RateLimitService } from './services/rate-limit.service';
import { BackendIntegrationService } from './services/backend-integration.service';
import { AuthController } from './controllers/auth.controller';
import { ConfigService } from '../config/config.service';

@Module({
  providers: [
    AuthService,
    JwtTokenService,
    RateLimitService,
    BackendIntegrationService,
    ConfigService,
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtTokenService],
})
export class AuthModule {}
