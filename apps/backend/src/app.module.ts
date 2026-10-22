import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DbModule } from './db/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { validateEnv } from './config/env.validation'
import { WatchlistModule } from './modules/watchlist/watchlist.module'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DbModule, AuthModule, WatchlistModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
