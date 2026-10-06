import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config.service';
import { AuthSession } from '../auth/entities/auth-session.entity';
import { Client } from '../auth/entities/client.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST', 'localhost'),
        port: configService.getNumber('DATABASE_PORT', 5432),
        username: configService.get('DATABASE_USERNAME', 'postgres'),
        password: configService.get('DATABASE_PASSWORD', 'postgres'),
        database: configService.get('DATABASE_NAME', 'trading_db'),
        entities: [AuthSession, Client],
        synchronize: false, // Use migrations instead
        logging: configService.isDevelopment(),
        ssl: configService.getBoolean('DATABASE_SSL', false),
        extra: {
          max: 20, // connection pool max size
        },
      }),
    }),
    TypeOrmModule.forFeature([AuthSession, Client]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
