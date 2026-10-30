import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { validateEnv } from './config/env.validation'
import { AircraftManagementModule } from '@backend/modules/aircraft-management/aircraft-management.module'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DbModule, AuthModule, AircraftManagementModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
