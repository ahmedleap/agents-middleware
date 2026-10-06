import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './services/auth.service';
import { JwtTokenService } from './services/jwt-token.service';
import { RateLimitService } from './services/rate-limit.service';
import { BackendIntegrationService } from './services/backend-integration.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { AuthController } from './controllers/auth.controller';
import { ConfigService } from '../config/config.service';
import { AuthSession } from './entities/auth-session.entity';
import { Client } from './entities/client.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuthSession, Client])],
  providers: [
    AuthService,
    JwtTokenService,
    RateLimitService,
    BackendIntegrationService,
    RefreshTokenService,
    ConfigService,
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtTokenService, RefreshTokenService],
})
export class AuthModule {}
