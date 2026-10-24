import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { validateEnv } from './config/env.validation'
import { AssignCrewModule } from './modules/crew-rostering/assign-crew/assign-crew.module'
import { BuildPairingModule } from './modules/crew-rostering/build-pairing/build-pairing.module'
import { FixPublishModule } from './modules/crew-rostering/fix-publish/fix-publish.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    AuthModule,
    BuildPairingModule,
    AssignCrewModule,
    FixPublishModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
