import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import type {
  BagLookup,
  BoardingPassView,
  CheckedBagView,
  FlightSummary,
  GateInfo,
  GateList,
  Headcount,
  ScanResult,
  StaffCheckInRow,
  StaffCheckInView,
} from './api-types'
import type { Actor } from './actor'
import { CounterService } from './counter.service'
import { optionalBoolean, optionalString, requireInt, requireNumber, requireString } from './dto/validate'
import { validation } from './errors'
import { GateService } from './gate.service'
import { CurrentActor, StaffGuard, requireActor } from './guards/staff.guard'

/** The counter and the gate: staff only, the guard refuses everybody else. */
@Controller('staff')
@UseGuards(StaffGuard)
export class StaffController {
  constructor(
    private readonly counter: CounterService,
    private readonly gate: GateService,
  ) {}

  @Get('check-ins')
  async search(@CurrentActor() actor: Actor | null, @Query() query: Record<string, unknown>): Promise<StaffCheckInRow[]> {
    return this.counter.search(requireActor(actor), {
      flightId: optionalString(query, 'flightId', { max: 64 }),
      pnr: optionalString(query, 'pnr', { max: 32 }),
      name: optionalString(query, 'name', { max: 64 }),
    })
  }

  @Get('check-ins/:id')
  async detail(@CurrentActor() actor: Actor | null, @Param('id') id: string): Promise<StaffCheckInView> {
    return this.counter.detail(requireActor(actor), id)
  }

  @Post('check-ins/:id/bags')
  async weighBag(@CurrentActor() actor: Actor | null, @Param('id') id: string, @Body() body: unknown): Promise<StaffCheckInView> {
    return this.counter.weighBag(requireActor(actor), id, {
      weightKg: requireNumber(body, 'weightKg', { min: 0 }),
      lengthCm: requireNumber(body, 'lengthCm', { min: 0 }),
      widthCm: requireNumber(body, 'widthCm', { min: 0 }),
      heightCm: requireNumber(body, 'heightCm', { min: 0 }),
    })
  }

  @Delete('bags/:id')
  async removeBag(@CurrentActor() actor: Actor | null, @Param('id') id: string): Promise<StaffCheckInView> {
    return this.counter.removeBag(requireActor(actor), id)
  }

  @Post('bags/:id/tag')
  async tagBag(@CurrentActor() actor: Actor | null, @Param('id') id: string): Promise<{ bag: CheckedBagView; view: StaffCheckInView }> {
    return this.counter.tagBag(requireActor(actor), id)
  }

  /** Feature 10 looks a bag up by the number on its tag. */
  @Get('bags/:tagNumber')
  async bagByTag(@CurrentActor() actor: Actor | null, @Param('tagNumber') tagNumber: string): Promise<BagLookup> {
    return this.counter.bagByTag(requireActor(actor), tagNumber)
  }

  @Get('flights/:flightId/bags')
  async bagsByFlight(@CurrentActor() actor: Actor | null, @Param('flightId') flightId: string): Promise<BagLookup[]> {
    return this.counter.bagsByFlight(requireActor(actor), flightId)
  }

  @Put('check-ins/:id/carry-on')
  async carryOn(@CurrentActor() actor: Actor | null, @Param('id') id: string, @Body() body: unknown): Promise<StaffCheckInView> {
    return this.counter.carryOn(requireActor(actor), id, {
      weightKg: requireNumber(body, 'weightKg', { min: 0 }),
      lengthCm: requireNumber(body, 'lengthCm', { min: 0 }),
      widthCm: requireNumber(body, 'widthCm', { min: 0 }),
      heightCm: requireNumber(body, 'heightCm', { min: 0 }),
    })
  }

  @Post('travel-documents/:id/clear-mismatch')
  async clearMismatch(@CurrentActor() actor: Actor | null, @Param('id') id: string): Promise<StaffCheckInView> {
    return this.counter.clearMismatch(requireActor(actor), id)
  }

  @Post('travel-documents/:id/check-visa')
  async checkVisa(@CurrentActor() actor: Actor | null, @Param('id') id: string): Promise<StaffCheckInView> {
    return this.counter.checkVisa(requireActor(actor), id)
  }

  @Post('boarding-passes/:id/print')
  async printPass(@CurrentActor() actor: Actor | null, @Param('id') id: string): Promise<BoardingPassView> {
    return this.counter.printPass(requireActor(actor), id)
  }

  @Get('gates')
  async gates(@CurrentActor() actor: Actor | null): Promise<GateInfo[]> {
    requireActor(actor)
    return this.gate.gates()
  }

  @Get('flights')
  async flights(@CurrentActor() actor: Actor | null): Promise<FlightSummary[]> {
    requireActor(actor)
    return this.gate.flights()
  }

  @Put('flights/:flightId/gate')
  async setGate(@CurrentActor() actor: Actor | null, @Param('flightId') flightId: string, @Body() body: unknown): Promise<FlightSummary> {
    return this.gate.setGate(requireActor(actor), flightId, { gateId: requireString(body, 'gateId', { max: 64 }) })
  }

  @Get('gates/:gateId/flights/:flightId/passengers')
  async passengerList(
    @CurrentActor() actor: Actor | null,
    @Param('gateId') gateId: string,
    @Param('flightId') flightId: string,
  ): Promise<GateList> {
    return this.gate.passengerList(requireActor(actor), gateId, flightId)
  }

  @Post('gates/:gateId/scans')
  async scan(@CurrentActor() actor: Actor | null, @Param('gateId') gateId: string, @Body() body: unknown): Promise<ScanResult> {
    return this.gate.scan(requireActor(actor), gateId, {
      flightId: requireString(body, 'flightId', { max: 64 }),
      reference: requireString(body, 'reference', { max: 32 }),
    })
  }

  @Get('flights/:flightId/headcount')
  async headcount(@CurrentActor() actor: Actor | null, @Param('flightId') flightId: string): Promise<Headcount> {
    return this.gate.headcount(requireActor(actor), flightId)
  }

  @Put('flights/:flightId/headcount')
  async setHeadcount(@CurrentActor() actor: Actor | null, @Param('flightId') flightId: string, @Body() body: unknown): Promise<Headcount> {
    const source = requireString(body, 'source', { max: 16 })
    if (source === 'sensor') return this.gate.setHeadcount(requireActor(actor), flightId, { source: 'sensor' })
    if (source === 'manual') {
      return this.gate.setHeadcount(requireActor(actor), flightId, { source: 'manual', count: requireInt(body, 'count', { min: 0 }) })
    }
    throw validation('The head-count comes from the sensor or from a manual count', { field: 'source' })
  }

  @Post('flights/:flightId/close-gate')
  async closeGate(@CurrentActor() actor: Actor | null, @Param('flightId') flightId: string, @Body() body: unknown): Promise<Headcount> {
    return this.gate.closeGate(requireActor(actor), flightId, { confirmMismatch: optionalBoolean(body, 'confirmMismatch') })
  }
}
