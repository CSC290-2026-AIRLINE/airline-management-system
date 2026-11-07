import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { AdminConsoleModule } from './modules/admin-console/admin-console.module'
import { BiDashboardsModule } from './modules/bi-dashboards/bi-dashboards.module'
import { validateEnv } from './config/env.validation'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DbModule, AuthModule, AdminConsoleModule, BiDashboardsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
