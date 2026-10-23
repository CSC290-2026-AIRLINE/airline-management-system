import { Module } from '@nestjs/common'
import { CrewRosteringController } from './crew-rostering.controller'
import { CrewRosteringService } from './crew-rostering.service'

/** `DbModule` is global, so `DbService` is injected without importing it here. */
@Module({
  controllers: [CrewRosteringController],
  providers: [CrewRosteringService],
})
export class CrewRosteringModule {}
