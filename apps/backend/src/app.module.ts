import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { validateEnv } from './config/env.validation'
import { PassengerProfilesModule } from '@backend/modules/passenger-profiles/passenger-profiles.module'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DbModule, AuthModule, PassengerProfilesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
