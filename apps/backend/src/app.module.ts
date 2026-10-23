import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { AircraftModule } from './modules/aircraftmng/aircraft.module';
import { AircraftTypeModule } from './modules/aircraft_type/aircraft-type.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    AuthModule, //comment if want to test
    AircraftModule,
    AircraftTypeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}