import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { Public } from '@backend/auth/decorators/public.decorator'
import type { BoardingPassView, CheckInView, SeatLock, SeatMap } from './api-types'
import type { Actor } from './actor'
import { CheckInService } from './checkin.service'
import { optionalString, requireInt, requireString } from './dto/validate'
import { ActorGuard, CurrentActor, requireActor } from './guards/staff.guard'

/** The passenger side: find the booking, passport, seat, bags, boarding pass. */
@Controller()
@UseGuards(ActorGuard)
export class CheckInController {
  constructor(private readonly checkins: CheckInService) {}

  @Post('check-ins')
  async start(@CurrentActor() actor: Actor | null, @Body() body: unknown): Promise<CheckInView> {
    return this.checkins.start(requireActor(actor), {
      pnr: requireString(body, 'pnr', { max: 32 }),
      lastName: requireString(body, 'lastName', { max: 64 }),
    })
  }

  @Get('check-ins/:id')
  async get(@CurrentActor() actor: Actor | null, @Param('id') id: string): Promise<CheckInView> {
    return this.checkins.get(requireActor(actor), id)
  }

  @Put('check-ins/:id/document')
  async submitDocument(@CurrentActor() actor: Actor | null, @Param('id') id: string, @Body() body: unknown): Promise<CheckInView> {
    return this.checkins.submitDocument(requireActor(actor), id, {
      mrzLine1: requireString(body, 'mrzLine1'),
      mrzLine2: requireString(body, 'mrzLine2'),
      visaNumber: optionalString(body, 'visaNumber', { max: 32 }),
    })
  }

  /** The seat map is public: the passenger may look at it before signing in. */
  @Public()
  @Get('flights/:flightId/seat-map')
  async seatMap(@CurrentActor() actor: Actor | null, @Param('flightId') flightId: string): Promise<SeatMap> {
    return this.checkins.seatMap(actor, flightId)
  }

  @Post('flights/:flightId/seat-locks')
  async holdSeat(@CurrentActor() actor: Actor | null, @Param('flightId') flightId: string, @Body() body: unknown): Promise<SeatLock> {
    return this.checkins.holdSeat(requireActor(actor), flightId, {
      checkInId: requireString(body, 'checkInId', { max: 64 }),
      seatCode: requireString(body, 'seatCode', { max: 8 }),
    })
  }

  @Delete('seat-locks/:id')
  async releaseSeat(@CurrentActor() actor: Actor | null, @Param('id') id: string): Promise<void> {
    await this.checkins.releaseSeat(requireActor(actor), id)
  }

  @Put('check-ins/:id/seat')
  async confirmSeat(@CurrentActor() actor: Actor | null, @Param('id') id: string, @Body() body: unknown): Promise<CheckInView> {
    return this.checkins.confirmSeat(requireActor(actor), id, { lockId: requireString(body, 'lockId', { max: 64 }) })
  }

  @Put('check-ins/:id/baggage')
  async declareBags(@CurrentActor() actor: Actor | null, @Param('id') id: string, @Body() body: unknown): Promise<CheckInView> {
    return this.checkins.declareBags(requireActor(actor), id, { declaredBags: requireInt(body, 'declaredBags', { min: 0, max: 10 }) })
  }

  @Post('check-ins/:id/complete')
  async complete(@CurrentActor() actor: Actor | null, @Param('id') id: string): Promise<BoardingPassView> {
    return this.checkins.complete(requireActor(actor), id)
  }

  @Get('check-ins/:id/boarding-pass')
  async boardingPass(@CurrentActor() actor: Actor | null, @Param('id') id: string): Promise<BoardingPassView> {
    return this.checkins.boardingPass(requireActor(actor), id)
  }
}
