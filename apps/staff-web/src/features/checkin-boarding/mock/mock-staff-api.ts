// Browser-side mock of the staff API. Same rules as the backend, so the Vercel demo needs no server.
import type {
  BagAllowance,
  BoardingPassView,
  CheckInStatus,
  CheckedBagView,
  FlightSummary,
  GateInfo,
  GateList,
  GateListEntry,
  Headcount,
  IssueCode,
  RejectReason,
  ScanResult,
  StaffCheckInRow,
  StaffCheckInView,
  TravelDocumentView,
} from '../api/types.ts'
import { ApiRequestError, type BagInput, type StaffApi, type StaffSearchQuery } from '../api/client.ts'
import { allocateExcess, bagTagNumber, carryOnResult, checkedBagRefusal, excessFee, roundKg } from '../domain/baggage.ts'
import { boardingGroup, decideScan } from '../domain/boarding.ts'
import { computeWindow, isWindowOpen } from '../domain/window.ts'
import {
  BOOKINGS,
  DEMO_NOW,
  FARE_CLASS_CABIN,
  FLIGHTS,
  GATES,
  PROFILES,
  PRICING,
  SEEDED_DOC_EXPIRY,
  SEEDED_PASSES,
  SETTINGS,
  VISA_RULES,
  seatTypeOf,
} from './fixtures.ts'

interface MockCheckIn {
  id: string
  bookingPassengerId: string
  passengerId: string
  flightId: string
  status: CheckInStatus
  declaredBags: number | null
  checkedInAt: string | null
  pnr: string
  passengerName: string
}

interface MockDocument {
  id: string
  checkInId: string
  numberLast4: string
  issuingCountry: string
  nationality: string | null
  expiryDate: string
  visaNumber: string | null
  visaRequired: boolean
  nameMismatch: boolean
  nameMismatchClearedAt: string | null
  profileDifferences: string[]
}

interface MockBag {
  id: string
  checkInId: string
  weightKg: number
  excessKg: number
  ratePerKg: number
  excessFee: number
  excessPaymentId: string | null
  tagNumber: string | null
  status: 'weighed' | 'tagged' | 'offloaded'
  weighedAt: string
}

interface MockPass {
  id: string
  checkInId: string
  reference: string
  seatCode: string
  boardingGroup: number
  printedAt: string | null
}

interface MockBoarding {
  flightId: string
  gateId: string
  sensorCount: number | null
  manualCount: number | null
  boardedCount: number
  closedAt: string | null
}

interface MockEvent {
  passId: string
  flightId: string
  gateId: string
  event: 'boarded' | 'rejected' | 'no_show'
  reason: string | null
  at: string
}

const notFound = (what: string) => new ApiRequestError(404, 'NOT_FOUND', `${what} not found`)
const round2 = (value: number) => Math.round(value * 100) / 100

/** The gate sensor reads one passenger short once the gate is busy, exactly like the prototype. */
const sensorFor = (boardedCount: number) => Math.max(0, boardedCount - (boardedCount >= 3 ? 1 : 0))

export function createMockStaffApi(opts?: { now?: Date }): StaffApi {
  const clock = new Date(opts?.now ?? DEMO_NOW)
  const nowIso = () => clock.toISOString()

  const checkIns = new Map<string, MockCheckIn>()
  const documents = new Map<string, MockDocument>()
  const bags = new Map<string, MockBag>()
  const carryOnChecks = new Map<string, { weightKg: number; withinSize: boolean; result: 'ok' | 'must_check'; checkedAt: string }>()
  const passes = new Map<string, MockPass>()
  const boarding = new Map<string, MockBoarding>()
  const events: MockEvent[] = []
  let bagTagSeq = 0
  let paymentSeq = 0
  let seq = 0

  // Feature 6 owns the gates: one boarding row per flight.
  for (const [flightId, gateId] of [
    ['flt-fy204', 'gate-a1'],
    ['flt-fy318', 'gate-a2'],
  ]) {
    boarding.set(flightId, { flightId, gateId, sensorCount: null, manualCount: null, boardedCount: 0, closedAt: null })
  }

  for (const seed of SEEDED_PASSES) {
    const booking = BOOKINGS.find((b) => b.pnr === seed.pnr)
    if (!booking) continue
    const profile = PROFILES.find((p) => p.id === booking.passengerId)
    const flight = FLIGHTS.find((f) => f.id === booking.flightId)
    const nationality = profile?.nationality ?? 'th'
    const checkIn: MockCheckIn = {
      id: `ci-${(seq += 1)}`,
      bookingPassengerId: booking.bookingPassengerId,
      passengerId: booking.passengerId,
      flightId: booking.flightId,
      status: seed.status,
      declaredBags: null,
      checkedInAt: nowIso(),
      pnr: booking.pnr,
      passengerName: `${booking.firstName} ${booking.lastName}`,
    }
    checkIns.set(checkIn.id, checkIn)
    const document: MockDocument = {
      id: `td-${(seq += 1)}`,
      checkInId: checkIn.id,
      numberLast4: profile?.passportNumber?.slice(-4) ?? '0000',
      issuingCountry: nationality,
      nationality: profile?.nationality ?? null,
      expiryDate: SEEDED_DOC_EXPIRY,
      visaNumber: null,
      visaRequired: visaRequired(nationality, flight?.destination.country ?? ''),
      nameMismatch: false,
      nameMismatchClearedAt: null,
      profileDifferences: [],
    }
    documents.set(document.id, document)
    const pass: MockPass = {
      id: `pass-${(seq += 1)}`,
      checkInId: checkIn.id,
      reference: seed.reference,
      seatCode: seed.seat,
      boardingGroup: boardingGroup({ specialAssistance: booking.specialAssistance, cabin: booking.cabin, tier: null }),
      printedAt: null,
    }
    passes.set(pass.id, pass)
  }

  function visaRequired(nationality: string, destinationCountry: string): boolean {
    const rule = VISA_RULES.find(([n, d]) => n === nationality && d === destinationCountry)
    return rule ? rule[2] : false
  }

  const bookingOf = (checkIn: MockCheckIn) => BOOKINGS.find((b) => b.bookingPassengerId === checkIn.bookingPassengerId)!
  const flightOf = (flightId: string) => FLIGHTS.find((f) => f.id === flightId)!
  const documentOf = (checkInId: string) => [...documents.values()].find((d) => d.checkInId === checkInId) ?? null
  const passOf = (checkInId: string) => [...passes.values()].find((p) => p.checkInId === checkInId) ?? null
  const bagsOf = (checkInId: string) => [...bags.values()].filter((b) => b.checkInId === checkInId)
  const checkInsOfFlight = (flightId: string) => [...checkIns.values()].filter((c) => c.flightId === flightId)
  const hasFinalEvent = (passId: string) => events.some((e) => e.passId === passId && (e.event === 'boarded' || e.event === 'no_show'))
  const gateCodeOf = (gateId: string | null) => (gateId ? (GATES.find((g) => g.id === gateId)?.code ?? null) : null)

  function mustCheckIn(id: string): MockCheckIn {
    const checkIn = checkIns.get(id)
    if (!checkIn) throw notFound('Check-in')
    return checkIn
  }

  function allowanceOf(checkIn: MockCheckIn): BagAllowance {
    const pricing = PRICING.baggage[FARE_CLASS_CABIN[bookingOf(checkIn).fareClass] ?? 'economy']
    return {
      freeKg: pricing.freeKg,
      tierBonusKg: 0,
      ratePerKg: pricing.ratePerKg,
      maxBagKg: pricing.maxBagKg,
      maxLinearCm: SETTINGS.checkedBagMaxLinearCm,
    }
  }

  function totalsOf(checkIn: MockCheckIn) {
    const list = bagsOf(checkIn.id)
    return {
      weightKg: roundKg(list.reduce((sum, b) => sum + b.weightKg, 0)),
      excessKg: roundKg(list.reduce((sum, b) => sum + b.excessKg, 0)),
      unpaidFee: round2(list.filter((b) => !b.excessPaymentId).reduce((sum, b) => sum + b.excessFee, 0)),
    }
  }

  function issuesOf(checkIn: MockCheckIn): IssueCode[] {
    const issues: IssueCode[] = []
    const document = documentOf(checkIn.id)
    if (checkIn.status === 'on_hold' || checkIn.status === 'denied') issues.push('ON_HOLD')
    if (totalsOf(checkIn).unpaidFee > 0) issues.push('EXCESS_UNPAID')
    if (document?.nameMismatch && !document.nameMismatchClearedAt) issues.push('NAME_MISMATCH')
    if (document?.visaRequired && !document.visaNumber) issues.push('VISA_CHECK')
    if (document && document.profileDifferences.length > 0) issues.push('PROFILE_DIFFERS')
    return issues
  }

  function flightSummary(flightId: string): FlightSummary {
    const flight = flightOf(flightId)
    const row = boarding.get(flightId)
    const gate = row ? (GATES.find((g) => g.id === row.gateId) ?? null) : null
    const window = computeWindow(flight.depAt, SETTINGS.window)
    return {
      id: flight.id,
      flightNumber: flight.flightNumber,
      serviceDate: flight.serviceDate,
      depAt: flight.depAt.toISOString(),
      status: flight.status,
      origin: flight.origin,
      destination: flight.destination,
      gate: gate ? { id: gate.id, code: gate.code } : null,
      boardingAt: window.boardingAt.toISOString(),
    }
  }

  function documentView(document: MockDocument): TravelDocumentView {
    return {
      id: document.id,
      numberLast4: document.numberLast4,
      issuingCountry: document.issuingCountry,
      nationality: document.nationality,
      expiryDate: document.expiryDate,
      visaNumber: document.visaNumber,
      visaRequired: document.visaRequired,
      nameMismatch: document.nameMismatch,
      nameMismatchClearedAt: document.nameMismatchClearedAt,
      profileDifferences: document.profileDifferences,
    }
  }

  function bagView(bag: MockBag): CheckedBagView {
    return {
      id: bag.id,
      checkInId: bag.checkInId,
      weightKg: bag.weightKg,
      excessKg: bag.excessKg,
      ratePerKg: bag.ratePerKg,
      excessFee: bag.excessFee,
      excessPaymentId: bag.excessPaymentId,
      tagNumber: bag.tagNumber,
      status: bag.status,
      weighedAt: bag.weighedAt,
    }
  }

  function passView(pass: MockPass): BoardingPassView {
    const checkIn = mustCheckIn(pass.checkInId)
    const flight = flightOf(checkIn.flightId)
    const gate = gateCodeOf(boarding.get(checkIn.flightId)?.gateId ?? null)
    const window = computeWindow(flight.depAt, SETTINGS.window)
    return {
      id: pass.id,
      checkInId: checkIn.id,
      reference: pass.reference,
      qrPayload: pass.reference,
      passengerName: checkIn.passengerName,
      flightNumber: flight.flightNumber,
      date: flight.serviceDate,
      origin: flight.origin.code,
      originCity: flight.origin.city,
      destination: flight.destination.code,
      destinationCity: flight.destination.city,
      depAt: flight.depAt.toISOString(),
      seat: pass.seatCode,
      gate,
      boardingAt: window.boardingAt.toISOString(),
      boardingGroup: pass.boardingGroup,
      bags: checkIn.declaredBags ?? 0,
      printedAt: pass.printedAt,
      walletPass: {
        format: 'flython-wallet-v1',
        reference: pass.reference,
        flightNumber: flight.flightNumber,
        seat: pass.seatCode,
        passengerName: checkIn.passengerName,
      },
    }
  }

  function checkInView(checkIn: MockCheckIn): StaffCheckInView['checkIn'] {
    const booking = bookingOf(checkIn)
    const flight = flightOf(checkIn.flightId)
    const window = computeWindow(flight.depAt, SETTINGS.window)
    const document = documentOf(checkIn.id)
    const pass = passOf(checkIn.id)
    const seatType = seatTypeOf(Number(pass?.seatCode.replace(/\D/g, '') ?? '0'))
    return {
      id: checkIn.id,
      status: checkIn.status,
      flight: flightSummary(checkIn.flightId),
      window: {
        opensAt: window.opensAt.toISOString(),
        closesAt: window.closesAt.toISOString(),
        boardingAt: window.boardingAt.toISOString(),
        isOpen: isWindowOpen(clock, window),
      },
      booking: { pnr: checkIn.pnr, bookingPassengerId: checkIn.bookingPassengerId },
      passenger: {
        id: checkIn.passengerId,
        firstName: booking.firstName,
        lastName: booking.lastName,
        cabin: booking.cabin,
        fareClass: booking.fareClass,
        specialAssistance: booking.specialAssistance,
      },
      steps: {
        document: document !== null,
        seat: pass !== null,
        baggage: checkIn.declaredBags !== null,
        boardingPass: pass !== null,
      },
      document: document ? documentView(document) : null,
      seat: pass ? { code: pass.seatCode, type: seatType, fee: PRICING.seatFee[seatType], paymentId: null } : null,
      declaredBags: checkIn.declaredBags,
      boardingPassId: pass?.id ?? null,
      checkedInAt: checkIn.checkedInAt,
    }
  }

  function staffView(checkIn: MockCheckIn): StaffCheckInView {
    const pass = passOf(checkIn.id)
    return {
      checkIn: checkInView(checkIn),
      bags: bagsOf(checkIn.id).map(bagView),
      allowance: allowanceOf(checkIn),
      carryOn: SETTINGS.carryOn,
      carryOnCheck: carryOnChecks.get(checkIn.id) ?? null,
      issues: issuesOf(checkIn),
      totals: totalsOf(checkIn),
      boardingPass: pass ? passView(pass) : null,
      isPolice: bookingOf(checkIn).isPolice,
    }
  }

  function headcountView(flightId: string): Headcount {
    const row = boarding.get(flightId)
    if (!row) throw notFound('Flight boarding')
    return {
      flightId,
      gateCode: gateCodeOf(row.gateId) ?? '',
      sensorCount: row.sensorCount,
      manualCount: row.manualCount,
      boardedCount: row.boardedCount,
      closedAt: row.closedAt,
    }
  }

  /** Each bag keeps the excess it added, the bags are weighed in order against the shared allowance. */
  function reallocate(checkInId: string): void {
    const list = bagsOf(checkInId)
    const excess = allocateExcess(
      list.map((b) => b.weightKg),
      allowanceOf(mustCheckIn(checkInId)).freeKg,
    )
    list.forEach((bag, index) => {
      if (bag.status === 'tagged') return
      bag.excessKg = excess[index]
      bag.excessFee = excessFee(excess[index], bag.ratePerKg)
    })
  }

  function rejectMessage(
    reason: RejectReason | null,
    name: string,
    passFlightNumber: string,
    correctGate: string | null,
    scanFlightNumber: string,
  ): string {
    switch (reason) {
      case 'ON_HOLD':
        return `On hold: do not board ${name}. Ask them to wait for Feature 7 security staff.`
      case 'WRONG_GATE':
        return `Wrong gate. ${name} is on ${passFlightNumber}. Send them to gate ${correctGate}.`
      case 'WRONG_FLIGHT':
        return `Wrong flight: ${name} is booked on ${passFlightNumber}, not ${scanFlightNumber}.`
      case 'GATE_CLOSED':
        return `Gate closed. No more boarding for ${scanFlightNumber}. ${name} stays a no-show.`
      case 'ALREADY_BOARDED':
        return `Already boarded: ${name} was scanned before.`
      default:
        return `Rejected: ${name} cannot board.`
    }
  }

  return {
    async search(q: StaffSearchQuery): Promise<StaffCheckInRow[]> {
      const pnr = q.pnr?.trim().toUpperCase()
      const name = q.name?.trim().toUpperCase()
      return [...checkIns.values()]
        .filter((c) => {
          if (q.flightId && c.flightId !== q.flightId) return false
          if (pnr && !c.pnr.toUpperCase().includes(pnr)) return false
          if (name && !c.passengerName.toUpperCase().includes(name)) return false
          return true
        })
        .map((c) => ({
          id: c.id,
          pnr: c.pnr,
          passengerName: c.passengerName,
          flightNumber: flightOf(c.flightId).flightNumber,
          status: c.status,
          issues: issuesOf(c),
        }))
    },

    async detail(id: string): Promise<StaffCheckInView> {
      return staffView(mustCheckIn(id))
    },

    async weighBag(id: string, input: BagInput): Promise<StaffCheckInView> {
      const checkIn = mustCheckIn(id)
      const weight = roundKg(input.weightKg)
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new ApiRequestError(400, 'VALIDATION', 'Bag weight must be a positive number')
      }
      const allowance = allowanceOf(checkIn)
      const refusal = checkedBagRefusal(
        { weightKg: weight, lengthCm: input.lengthCm, widthCm: input.widthCm, heightCm: input.heightCm },
        { maxBagKg: allowance.maxBagKg, maxLinearCm: allowance.maxLinearCm },
      )
      if (refusal === 'overweight') {
        throw new ApiRequestError(422, 'BAG_REFUSED', `Bag is over the ${allowance.maxBagKg} kg limit`)
      }
      if (refusal === 'oversize') {
        throw new ApiRequestError(422, 'BAG_REFUSED', `Bag is over the ${allowance.maxLinearCm} cm size limit`)
      }
      const bag: MockBag = {
        id: `bag-${(seq += 1)}`,
        checkInId: id,
        weightKg: weight,
        excessKg: 0,
        ratePerKg: allowance.ratePerKg,
        excessFee: 0,
        excessPaymentId: null,
        tagNumber: null,
        status: 'weighed',
        weighedAt: nowIso(),
      }
      bags.set(bag.id, bag)
      reallocate(id)
      return staffView(checkIn)
    },

    async removeBag(bagId: string): Promise<StaffCheckInView> {
      const bag = bags.get(bagId)
      if (!bag) throw notFound('Bag')
      if (bag.status === 'tagged') {
        throw new ApiRequestError(409, 'INVALID_STATE', 'A tagged bag cannot be removed')
      }
      bags.delete(bagId)
      reallocate(bag.checkInId)
      return staffView(mustCheckIn(bag.checkInId))
    },

    async tagBag(bagId: string): Promise<{ bag: CheckedBagView; view: StaffCheckInView }> {
      const bag = bags.get(bagId)
      if (!bag) throw notFound('Bag')
      if (bag.tagNumber) {
        throw new ApiRequestError(409, 'INVALID_STATE', 'This bag is already tagged')
      }
      // The bags of one passenger are paid together, so the unpaid excess of all of them is charged first.
      const unpaid = bagsOf(bag.checkInId).filter((b) => !b.excessPaymentId && b.excessFee > 0)
      if (unpaid.length > 0) {
        const paymentId = `pay-${(paymentSeq += 1)}`
        for (const b of unpaid) b.excessPaymentId = paymentId
      }
      bag.tagNumber = bagTagNumber(SETTINGS.bagTagAirlineNumber, (bagTagSeq += 1))
      bag.status = 'tagged'
      return { bag: bagView(bag), view: staffView(mustCheckIn(bag.checkInId)) }
    },

    async carryOn(id: string, input: BagInput): Promise<StaffCheckInView> {
      const checkIn = mustCheckIn(id)
      const result = carryOnResult(
        { weightKg: input.weightKg, lengthCm: input.lengthCm, widthCm: input.widthCm, heightCm: input.heightCm },
        SETTINGS.carryOn,
      )
      carryOnChecks.set(id, {
        weightKg: roundKg(input.weightKg),
        withinSize: result.withinSize,
        result: result.result,
        checkedAt: nowIso(),
      })
      return staffView(checkIn)
    },

    async clearMismatch(documentId: string): Promise<StaffCheckInView> {
      const document = documents.get(documentId)
      if (!document) throw notFound('Travel document')
      document.nameMismatchClearedAt = nowIso()
      return staffView(mustCheckIn(document.checkInId))
    },

    async checkVisa(documentId: string): Promise<StaffCheckInView> {
      const document = documents.get(documentId)
      if (!document) throw notFound('Travel document')
      if (!document.visaNumber) document.visaNumber = 'DEMO-VISA-0001'
      return staffView(mustCheckIn(document.checkInId))
    },

    async printPass(passId: string): Promise<BoardingPassView> {
      const pass = passes.get(passId)
      if (!pass) throw notFound('Boarding pass')
      pass.printedAt = nowIso()
      return passView(pass)
    },

    async gates(): Promise<GateInfo[]> {
      return GATES.map((g) => ({ id: g.id, code: g.code, airportCode: g.airport_code, isActive: g.is_active }))
    },

    async flights(): Promise<FlightSummary[]> {
      return FLIGHTS.map((f) => flightSummary(f.id))
    },

    async setGate(flightId: string, input: { gateId: string }): Promise<FlightSummary> {
      const row = boarding.get(flightId)
      if (!row) throw notFound('Flight boarding')
      if (!GATES.some((g) => g.id === input.gateId)) throw notFound('Gate')
      row.gateId = input.gateId
      return flightSummary(flightId)
    },

    async passengerList(gateId: string, flightId: string): Promise<GateList> {
      const gate = GATES.find((g) => g.id === gateId)
      if (!gate) throw notFound('Gate')
      const row = boarding.get(flightId)
      if (!row) throw notFound('Flight boarding')
      if (row.gateId !== gateId) {
        throw new ApiRequestError(404, 'NOT_FOUND', 'This flight is not at this gate')
      }
      const entries: GateListEntry[] = []
      for (const checkIn of checkInsOfFlight(flightId)) {
        const pass = passOf(checkIn.id)
        if (!pass) continue
        const booking = bookingOf(checkIn)
        entries.push({
          checkInId: checkIn.id,
          boardingPassId: pass.id,
          reference: pass.reference,
          passengerName: checkIn.passengerName,
          seat: pass.seatCode,
          boardingGroup: pass.boardingGroup,
          specialAssistance: booking.specialAssistance,
          isPolice: booking.isPolice,
          boarded: checkIn.status === 'boarded',
          status: checkIn.status,
        })
      }
      return {
        gate: { id: gate.id, code: gate.code },
        flight: flightSummary(flightId),
        closedAt: row.closedAt,
        boardedCount: row.boardedCount,
        police: entries.filter((e) => e.isPolice),
        // The air marshals board first, so they are not repeated in a group.
        groups: {
          '1': entries.filter((e) => e.boardingGroup === 1 && !e.isPolice),
          '2': entries.filter((e) => e.boardingGroup === 2 && !e.isPolice),
          '3': entries.filter((e) => e.boardingGroup === 3 && !e.isPolice),
          '4': entries.filter((e) => e.boardingGroup === 4 && !e.isPolice),
        },
      }
    },

    async scan(gateId: string, input: { flightId: string; reference: string }): Promise<ScanResult> {
      const reference = input.reference.trim().toUpperCase()
      const pass = [...passes.values()].find((p) => p.reference.toUpperCase() === reference) ?? null
      const checkIn = pass ? (checkIns.get(pass.checkInId) ?? null) : null
      if (!pass || !checkIn) {
        return {
          event: 'rejected',
          reason: 'NOT_FOUND',
          message: `Rejected (not found): ${reference || '(empty)'} is not a boarding pass for any flight today.`,
          passenger: null,
          correctGate: null,
        }
      }
      const passRow = boarding.get(checkIn.flightId) ?? null
      const decision = decideScan({
        pass: { flightId: checkIn.flightId, status: checkIn.status, alreadyFinal: hasFinalEvent(pass.id) },
        gateId,
        flightAtGate: input.flightId,
        passFlightGateId: passRow?.gateId ?? null,
        passFlightClosedAt: passRow?.closedAt ? new Date(passRow.closedAt) : null,
      })
      const passenger = { name: checkIn.passengerName, seat: pass.seatCode, boardingGroup: pass.boardingGroup }
      if (decision.event === 'boarded') {
        checkIn.status = 'boarded'
        const row = boarding.get(checkIn.flightId)
        if (row) row.boardedCount += 1
        events.push({ passId: pass.id, flightId: input.flightId, gateId, event: 'boarded', reason: null, at: nowIso() })
        return {
          event: 'boarded',
          reason: null,
          message: `Boarded: ${checkIn.passengerName}, seat ${pass.seatCode}.`,
          passenger,
          correctGate: null,
        }
      }
      const correctGate = gateCodeOf(passRow?.gateId ?? null)
      events.push({
        passId: pass.id,
        flightId: input.flightId,
        gateId,
        event: 'rejected',
        reason: decision.reason,
        at: nowIso(),
      })
      return {
        event: 'rejected',
        reason: decision.reason,
        message: rejectMessage(
          decision.reason,
          checkIn.passengerName,
          flightOf(checkIn.flightId).flightNumber,
          correctGate,
          flightOf(input.flightId).flightNumber,
        ),
        passenger,
        correctGate,
      }
    },

    async headcount(flightId: string): Promise<Headcount> {
      return headcountView(flightId)
    },

    async setHeadcount(flightId: string, input: { source: 'sensor' } | { source: 'manual'; count: number }): Promise<Headcount> {
      const row = boarding.get(flightId)
      if (!row) throw notFound('Flight boarding')
      if (input.source === 'sensor') {
        row.sensorCount = sensorFor(row.boardedCount)
      } else {
        if (!Number.isInteger(input.count) || input.count < 0) {
          throw new ApiRequestError(400, 'VALIDATION', 'Manual count must be a whole number')
        }
        row.manualCount = input.count
      }
      return headcountView(flightId)
    },

    async closeGate(flightId: string, input: { confirmMismatch?: boolean }): Promise<Headcount> {
      const row = boarding.get(flightId)
      if (!row) throw notFound('Flight boarding')
      if (row.closedAt) {
        throw new ApiRequestError(409, 'INVALID_STATE', 'This gate is already closed')
      }
      const count = row.manualCount ?? row.sensorCount
      if (count === null) {
        throw new ApiRequestError(400, 'VALIDATION', 'A head-count is required before closing the gate')
      }
      if (count !== row.boardedCount && !input.confirmMismatch) {
        throw new ApiRequestError(
          409,
          'HEADCOUNT_MISMATCH',
          `Head-count mismatch: ${row.boardedCount} marked boarded, ${count} counted. Check the aircraft, then confirm.`,
          { boardedCount: row.boardedCount, count },
        )
      }
      row.closedAt = nowIso()
      for (const checkIn of checkInsOfFlight(flightId)) {
        const pass = passOf(checkIn.id)
        if (!pass || hasFinalEvent(pass.id)) continue
        checkIn.status = 'no_show'
        events.push({ passId: pass.id, flightId, gateId: row.gateId, event: 'no_show', reason: null, at: nowIso() })
        for (const bag of bagsOf(checkIn.id)) {
          if (bag.status !== 'offloaded') bag.status = 'offloaded'
        }
      }
      return headcountView(flightId)
    },
  }
}
