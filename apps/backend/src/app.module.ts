import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { AdminConsoleModule } from './modules/admin-console/admin-console.module'
import { validateEnv } from './config/env.validation'
import { PassengerLostReportModule } from './modules/baggage/passenger-lost-report.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DbModule,
    AuthModule,
    AdminConsoleModule,
    PassengerLostReportModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
