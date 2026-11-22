import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

@Module({
  imports: [
    ConfigModule,
    // Feature 15's audit writer, for the sign_in / sign_out / sign_in_blocked rows.
    AuditModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        secret: configService.get('ACCESS_TOKEN_SECRET', { infer: true }),
        signOptions: { expiresIn: configService.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AuthModule {}
