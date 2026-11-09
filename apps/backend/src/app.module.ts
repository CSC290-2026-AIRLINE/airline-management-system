import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { AdminConsoleModule } from './modules/admin-console/admin-console.module'
import { LoyaltyModule } from './modules/loyalty/loyalty.module'
import { validateEnv } from './config/env.validation'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DbModule, AuthModule, AdminConsoleModule, LoyaltyModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
