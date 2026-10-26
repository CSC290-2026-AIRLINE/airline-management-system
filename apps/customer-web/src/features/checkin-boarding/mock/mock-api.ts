import { ApiRequestError, type CheckInApi } from '../api/client.ts'
import type {
  BoardingPassView,
  Cabin,
  CheckInStatus,
  CheckInView,
  SeatChoice,
  SeatLock,
  SeatMap,
  SeatStatus,
  SeatType,
  TravelDocumentView,
} from '../api/types.ts'
import { toAlpha2 } from '../domain/countries.ts'
import { compareNames, isPassportValidForTravel, profileSync, validateMrz } from '../domain/mrz.ts'
import { computeWindow, isWindowOpen } from '../domain/window.ts'
import type { BookingPassenger, FlightRecord } from './fixtures.ts'
import {
  BLOCKED_SEATS,
  BOOKINGS,
  DEMO_NOW,
  FLIGHT_GATES,
  FLIGHTS,
  GATES,
  HOLD_LAST4,
  PRICING,
  PROFILES,
  SEAT_LAYOUT,
  SEAT_LIST,
  SEEDED_PASSES,
  SETTINGS,
  TAKEN_SEATS,
  VISA_RULES,
  seatOf,
} from './fixtures.ts'

interface MockCheckIn {
  id: string
  bookingPassengerId: string
  passengerId: string
  flightId: string
  status: CheckInStatus
  declaredBags: number | null
  document: TravelDocumentView | null
  seat: SeatChoice | null
  checkedInAt: string | null
  createdAt: string
}

interface MockPass {
  id: string
  checkInId: string
  reference: string
  seatCode: string
  boardingGroup: number
  printedAt: string | null
}

interface MockLock {
  lock: SeatLock
  bookingPassengerId: string
}

/** The same alphabet the backend uses: no I, O, 0 or 1 to misread on a printed pass. */
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const HOLD_MINUTES = 5

function fail(status: number, code: string, message: string, details?: Record<string, unknown>): never {
  throw new ApiRequestError(status, code, message, details)
}

function newReference(): string {
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += REFERENCE_ALPHABET[Math.floor(Math.random() * REFERENCE_ALPHABET.length)]
  }
  return out
}

/** Air marshals board first, then special assistance, First/Business, Premium Economy, the rest. */
function boardingGroupOf(booking: BookingPassenger): number {
  if (booking.isPolice) return 1
  if (booking.specialAssistance.length > 0) return 1
  if (booking.cabin === 'first' || booking.cabin === 'business') return 2
  if (booking.cabin === 'premium_economy') return 3
  return 4
}

function visaNeeded(nationality: string, destination: string): boolean {
  const rule = VISA_RULES.find(([n, d]) => n === nationality && d === destination)
  return rule ? rule[2] : false
}

/**
 * The browser twin of the backend service: same rules, same error codes, no database and no server.
 * It backs the Vercel demo (VITE_F6_MOCK=true) and must stay in step with the backend.
 */
export function createMockApi(opts?: { now?: Date; latencyMs?: number }): CheckInApi {
  const boot = Date.now()
  const base = opts?.now ?? DEMO_NOW
  const latencyMs = opts?.latencyMs ?? 0

  const checkIns = new Map<string, MockCheckIn>()
  const byBooking = new Map<string, string>()
  const passes = new Map<string, MockPass>()
  const locks = new Map<string, MockLock>()
  const assignments = new Map<string, { seatCode: string; type: SeatType }>()
  const profiles = new Map(PROFILES.map((p) => [p.id, { ...p }]))
  let seq = 0

  for (const seed of SEEDED_PASSES) {
    const booking = BOOKINGS.find((b) => b.pnr === seed.pnr)
    if (booking) {
      assignments.set(booking.bookingPassengerId, { seatCode: seed.seat, type: seatOf(seed.seat)?.type ?? 'standard' })
    }
  }

  const now = (): Date => new Date(base.getTime() + (Date.now() - boot))
  const tick = async (): Promise<void> => {
    if (latencyMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, latencyMs))
  }

  function checkInOf(id: string): MockCheckIn {
    const record = checkIns.get(id)
    if (!record) fail(404, 'NOT_FOUND', 'Check-in not found')
    return record
  }

  /** The backend only works on a started check-in that is not held by security. */
  function assertStarted(record: MockCheckIn, message: string): void {
    if (record.status === 'on_hold' || record.status === 'denied') fail(409, 'ON_HOLD', 'Security is holding this check-in')
    if (record.status !== 'started') fail(409, 'INVALID_STATE', message)
  }

  /** The window is derived from the departure every time, so a delay moves it. */
  function assertWindowOpen(flight: FlightRecord): void {
    const window = computeWindow(flight.depAt, SETTINGS.window)
    if (isWindowOpen(now(), window)) return
    fail(409, 'WINDOW_CLOSED', 'Check-in is not open for this flight', {
      opensAt: window.opensAt.toISOString(),
      closesAt: window.closesAt.toISOString(),
    })
  }

  function bookingOf(bookingPassengerId: string): BookingPassenger {
    const booking = BOOKINGS.find((b) => b.bookingPassengerId === bookingPassengerId)
    if (!booking) fail(404, 'NOT_FOUND', 'Booking not found')
    return booking
  }

  function flightOf(id: string): FlightRecord {
    const flight = FLIGHTS.find((f) => f.id === id)
    if (!flight) fail(404, 'NOT_FOUND', 'Flight not found')
    return flight
  }

  function gateOf(flightId: string): { id: string; code: string } | null {
    const gateId = FLIGHT_GATES[flightId]
    const gate = gateId ? GATES.find((g) => g.id === gateId) : undefined
    return gate ? { id: gate.id, code: gate.code } : null
  }

  function seatsTakenOnFlight(flightId: string): Set<string> {
    const taken = new Set<string>()
    for (const booking of BOOKINGS.filter((b) => b.flightId === flightId)) {
      const seat = assignments.get(booking.bookingPassengerId)
      if (seat) taken.add(seat.seatCode)
    }
    return taken
  }

  function heldByOther(seatCode: string, bookingPassengerId: string | null): boolean {
    const at = now().getTime()
    for (const entry of locks.values()) {
      if (entry.lock.seatCode === seatCode && entry.bookingPassengerId !== bookingPassengerId) {
        if (new Date(entry.lock.expiresAt).getTime() > at) return true
      }
    }
    return false
  }

  /** No seat picked: any free standard seat, an exit row only for a passenger who may have one. */
  function assignAnyStandard(flightId: string, booking: BookingPassenger, avoidExitRow: boolean): { seatCode: string; type: SeatType } {
    const taken = seatsTakenOnFlight(flightId)
    const free = SEAT_LIST.filter(
      (seat) =>
        seat.cabin === booking.cabin &&
        !TAKEN_SEATS.has(seat.code) &&
        !BLOCKED_SEATS.has(seat.code) &&
        !taken.has(seat.code) &&
        !heldByOther(seat.code, booking.bookingPassengerId),
    )
    const seat =
      free.find((s) => s.type === 'standard' || s.type === 'business') ?? (avoidExitRow ? undefined : free.find((s) => s.type === 'exit'))
    if (!seat) fail(409, 'SEAT_TAKEN', 'No free seat left on this flight')
    assignments.set(booking.bookingPassengerId, { seatCode: seat.code, type: seat.type })
    return { seatCode: seat.code, type: seat.type }
  }

  function view(record: MockCheckIn): CheckInView {
    const booking = bookingOf(record.bookingPassengerId)
    const flight = flightOf(record.flightId)
    const window = computeWindow(flight.depAt, SETTINGS.window)
    const gate = gateOf(flight.id)
    const pass = passes.get(record.id)
    const assigned = assignments.get(record.bookingPassengerId)
    const seat =
      record.seat ??
      (assigned ? { code: assigned.seatCode, type: assigned.type, fee: PRICING.seatFee[assigned.type], paymentId: null } : null)
    return {
      id: record.id,
      status: record.status,
      flight: {
        id: flight.id,
        flightNumber: flight.flightNumber,
        serviceDate: flight.serviceDate,
        depAt: flight.depAt.toISOString(),
        status: flight.status,
        origin: flight.origin,
        destination: flight.destination,
        gate,
        boardingAt: window.boardingAt.toISOString(),
      },
      window: {
        opensAt: window.opensAt.toISOString(),
        closesAt: window.closesAt.toISOString(),
        boardingAt: window.boardingAt.toISOString(),
        isOpen: isWindowOpen(now(), window),
      },
      booking: { pnr: booking.pnr, bookingPassengerId: booking.bookingPassengerId },
      passenger: {
        id: booking.passengerId,
        firstName: booking.firstName,
        lastName: booking.lastName,
        cabin: booking.cabin,
        fareClass: booking.fareClass,
        specialAssistance: booking.specialAssistance,
      },
      steps: {
        document: record.document !== null,
        seat: seat !== null,
        baggage: record.declaredBags !== null,
        boardingPass: pass !== undefined,
      },
      document: record.document,
      seat,
      declaredBags: record.declaredBags,
      boardingPassId: pass?.id ?? null,
      checkedInAt: record.checkedInAt,
    }
  }

  function passView(pass: MockPass): BoardingPassView {
    const record = checkInOf(pass.checkInId)
    const booking = bookingOf(record.bookingPassengerId)
    const flight = flightOf(record.flightId)
    const window = computeWindow(flight.depAt, SETTINGS.window)
    const gate = gateOf(flight.id)
    const passengerName = `${booking.firstName} ${booking.lastName}`
    return {
      id: pass.id,
      checkInId: pass.checkInId,
      reference: pass.reference,
      qrPayload: pass.reference,
      passengerName,
      flightNumber: flight.flightNumber,
      date: flight.serviceDate,
      origin: flight.origin.code,
      originCity: flight.origin.city,
      destination: flight.destination.code,
      destinationCity: flight.destination.city,
      depAt: flight.depAt.toISOString(),
      seat: pass.seatCode,
      gate: gate?.code ?? null,
      boardingAt: window.boardingAt.toISOString(),
      boardingGroup: pass.boardingGroup,
      bags: record.declaredBags ?? 0,
      printedAt: pass.printedAt,
      walletPass: {
        format: 'flython-wallet-v1',
        reference: pass.reference,
        flightNumber: flight.flightNumber,
        seat: pass.seatCode,
        passengerName,
      },
    }
  }

  async function start(input: { pnr: string; lastName: string }): Promise<CheckInView> {
    await tick()
    const pnr = input.pnr.trim().toUpperCase()
    const lastName = input.lastName.trim().toUpperCase()
    const booking = BOOKINGS.find((b) => b.pnr.toUpperCase() === pnr && b.lastName.toUpperCase() === lastName)
    if (!booking) fail(404, 'NOT_FOUND', 'No booking found for that reference and surname')
    if (!booking.paid) fail(409, 'NOT_ELIGIBLE', 'This booking is not paid')
    const flight = flightOf(booking.flightId)
    if (flight.status === 'cancelled') fail(409, 'NOT_ELIGIBLE', 'This flight is cancelled')
    const window = computeWindow(flight.depAt, SETTINGS.window)
    if (!isWindowOpen(now(), window)) fail(409, 'WINDOW_CLOSED', 'Check-in is not open for this flight')

    const existing = byBooking.get(booking.bookingPassengerId)
    if (existing) return view(checkInOf(existing))

    const record: MockCheckIn = {
      id: `ci-mock-${(seq += 1)}`,
      bookingPassengerId: booking.bookingPassengerId,
      passengerId: booking.passengerId,
      flightId: booking.flightId,
      status: 'started',
      declaredBags: null,
      document: null,
      seat: null,
      checkedInAt: null,
      createdAt: now().toISOString(),
    }
    checkIns.set(record.id, record)
    byBooking.set(booking.bookingPassengerId, record.id)
    return view(record)
  }

  async function get(id: string): Promise<CheckInView> {
    await tick()
    return view(checkInOf(id))
  }

  async function submitDocument(id: string, input: { mrzLine1: string; mrzLine2: string; visaNumber?: string }): Promise<CheckInView> {
    await tick()
    const record = checkInOf(id)
    assertStarted(record, 'The travel document can only be submitted while the check-in is open')
    const flight = flightOf(record.flightId)
    assertWindowOpen(flight)

    const mrz = validateMrz(input.mrzLine1, input.mrzLine2)
    if (!mrz.ok) fail(422, 'MRZ_INVALID', mrz.message, { failedCheck: mrz.failedCheck })
    const data = mrz.data

    const booking = bookingOf(record.bookingPassengerId)
    if (!isPassportValidForTravel(data.expiryDate, flight.serviceDate)) {
      fail(422, 'PASSPORT_EXPIRING', 'The passport expires less than six months after travel')
    }

    const nationality = toAlpha2(data.nationality3)
    const visaRequired = nationality !== null && visaNeeded(nationality, flight.destination.country)
    const visaNumber = input.visaNumber?.trim() ?? ''
    if (visaRequired && !visaNumber) fail(422, 'VISA_REQUIRED', 'A visa number is required for this route')

    const profile = profiles.get(record.passengerId)
    for (const other of profiles.values()) {
      if (other.id === record.passengerId || other.passportNumber !== data.number) continue
      const sameName =
        other.firstName.trim().toUpperCase() === booking.firstName.trim().toUpperCase() &&
        other.lastName.trim().toUpperCase() === booking.lastName.trim().toUpperCase()
      const sameBirth = !other.dateOfBirth || other.dateOfBirth === data.dateOfBirth
      const sameNationality = !other.nationality || !nationality || other.nationality.toLowerCase() === nationality
      if (!sameName || !sameBirth || !sameNationality) fail(409, 'DUPLICATE_DOCUMENT', 'This passport number belongs to another passenger')
    }

    const sync = profileSync(
      {
        dateOfBirth: profile?.dateOfBirth ?? null,
        gender: profile?.gender ?? null,
        nationality: profile?.nationality ?? null,
        passportNumber: profile?.passportNumber ?? null,
      },
      data,
    )
    // An issuing country we cannot map is kept as 'zz' and flagged, the way the backend stores it.
    const issuingCountry = toAlpha2(data.issuingCountry3)
    const differences: string[] = [...sync.differences]
    if (!issuingCountry) differences.push('issuing_country_unmapped')
    record.document = {
      id: `td-mock-${(seq += 1)}`,
      numberLast4: data.numberLast4,
      issuingCountry: issuingCountry ?? 'zz',
      nationality,
      expiryDate: data.expiryDate,
      visaNumber: visaRequired ? visaNumber : null,
      visaRequired,
      nameMismatch: compareNames(data, { firstName: booking.firstName, lastName: booking.lastName }),
      nameMismatchClearedAt: null,
      profileDifferences: differences,
    }

    // Feature 7 owns the passenger profile: fill the empty fields, never overwrite one.
    if (profile) {
      if (profile.dateOfBirth === null && sync.fill.dateOfBirth !== undefined) profile.dateOfBirth = sync.fill.dateOfBirth
      if (profile.gender === null && sync.fill.gender !== undefined) profile.gender = sync.fill.gender
      if (profile.nationality === null && sync.fill.nationality !== undefined) profile.nationality = sync.fill.nationality
      if (profile.passportNumber === null && sync.fill.passportNumber !== undefined) profile.passportNumber = sync.fill.passportNumber
    }

    // Feature 7 screens every passenger; F6 never says why somebody is held.
    if (data.numberLast4 === HOLD_LAST4 || booking.lastName.toUpperCase() === 'KOWALSKI') {
      record.status = 'on_hold'
    }
    return view(record)
  }

  async function seatMap(flightId: string): Promise<SeatMap> {
    await tick()
    flightOf(flightId)
    const viewer = [...checkIns.values()].at(-1)
    const viewerBooking = viewer ? bookingOf(viewer.bookingPassengerId) : null
    const mine = viewerBooking ? assignments.get(viewerBooking.bookingPassengerId)?.seatCode : undefined
    const rows: SeatMap['rows'] = []
    for (const seat of SEAT_LIST) {
      let row = rows.find((r) => r.row === seat.row)
      if (!row) {
        row = { row: seat.row, exitRow: SEAT_LAYOUT.exitRows.includes(seat.row), seats: [] }
        rows.push(row)
      }
      row.seats.push({
        code: seat.code,
        row: seat.row,
        letter: seat.letter,
        cabin: seat.cabin,
        type: seat.type,
        status: statusOf(seat.code, flightId, mine, viewerBooking?.cabin ?? null, viewerBooking?.bookingPassengerId ?? null),
        fee: seat.fee,
      })
    }
    return { flightId, rows }
  }

  function statusOf(
    seatCode: string,
    flightId: string,
    mine: string | undefined,
    viewerCabin: Cabin | null,
    viewerBookingPassengerId: string | null,
  ): SeatStatus {
    if (mine === seatCode) return 'mine'
    if (TAKEN_SEATS.has(seatCode)) return 'taken'
    if (BLOCKED_SEATS.has(seatCode)) return 'blocked'
    if (viewerCabin && seatOf(seatCode)?.cabin !== viewerCabin) return 'blocked'
    if (seatsTakenOnFlight(flightId).has(seatCode)) return 'taken'
    if (heldByOther(seatCode, viewerBookingPassengerId)) return 'held'
    return 'free'
  }

  async function holdSeat(flightId: string, input: { checkInId: string; seatCode: string }): Promise<SeatLock> {
    await tick()
    const record = checkInOf(input.checkInId)
    if (record.status === 'on_hold') fail(409, 'ON_HOLD', 'Please see an agent at the airport')
    if (!record.document) fail(409, 'INVALID_STATE', 'The travel document must be submitted before a seat can be picked')
    const seat = seatOf(input.seatCode)
    if (!seat) fail(400, 'VALIDATION', `Seat ${input.seatCode} does not exist`)
    const booking = bookingOf(record.bookingPassengerId)
    if (seat.type === 'exit' && booking.specialAssistance.length > 0) {
      fail(400, 'VALIDATION', 'Exit row seats are not available to passengers who need special assistance', {
        reason: 'exit_row_special_assistance',
      })
    }
    if (seat.cabin !== booking.cabin) fail(409, 'SEAT_TAKEN', `Seat ${input.seatCode} is not in your cabin`, { seatCode: input.seatCode })
    if (BLOCKED_SEATS.has(input.seatCode) || TAKEN_SEATS.has(input.seatCode)) {
      fail(409, 'SEAT_TAKEN', `Seat ${input.seatCode} is not available`, { seatCode: input.seatCode })
    }
    const own = assignments.get(booking.bookingPassengerId)?.seatCode === input.seatCode
    if (!own && seatsTakenOnFlight(flightId).has(input.seatCode)) {
      fail(409, 'SEAT_TAKEN', `Seat ${input.seatCode} is taken`, { seatCode: input.seatCode })
    }
    if (heldByOther(input.seatCode, booking.bookingPassengerId)) {
      fail(409, 'SEAT_TAKEN', `Seat ${input.seatCode} is held by another passenger`, { seatCode: input.seatCode })
    }

    for (const [id, entry] of locks) {
      if (entry.bookingPassengerId === booking.bookingPassengerId) locks.delete(id)
    }
    const lock: SeatLock = {
      id: `lock-mock-${(seq += 1)}`,
      flightId,
      seatCode: input.seatCode,
      expiresAt: new Date(now().getTime() + HOLD_MINUTES * 60_000).toISOString(),
      fee: seat.fee,
    }
    locks.set(lock.id, { lock, bookingPassengerId: booking.bookingPassengerId })
    return lock
  }

  async function releaseSeat(lockId: string): Promise<void> {
    await tick()
    locks.delete(lockId)
  }

  async function confirmSeat(id: string, input: { lockId: string }): Promise<CheckInView> {
    await tick()
    const record = checkInOf(id)
    if (record.status === 'on_hold') fail(409, 'ON_HOLD', 'Please see an agent at the airport')
    const entry = locks.get(input.lockId)
    if (!entry || entry.bookingPassengerId !== record.bookingPassengerId) fail(404, 'NOT_FOUND', 'Seat hold not found')
    if (new Date(entry.lock.expiresAt).getTime() <= now().getTime()) {
      locks.delete(input.lockId)
      fail(409, 'LOCK_EXPIRED', 'The seat hold has expired', { seatCode: entry.lock.seatCode })
    }
    locks.delete(input.lockId)
    const type = seatOf(entry.lock.seatCode)?.type ?? 'standard'
    assignments.set(record.bookingPassengerId, { seatCode: entry.lock.seatCode, type })
    record.seat = {
      code: entry.lock.seatCode,
      type,
      fee: entry.lock.fee,
      paymentId: entry.lock.fee > 0 ? `pay-mock-${(seq += 1)}` : null,
    }
    return view(record)
  }

  async function declareBags(id: string, input: { declaredBags: number }): Promise<CheckInView> {
    await tick()
    const record = checkInOf(id)
    assertStarted(record, 'The bags can only be declared while the check-in is open')
    if (!Number.isInteger(input.declaredBags) || input.declaredBags < 0 || input.declaredBags > 10) {
      fail(400, 'VALIDATION', 'The number of bags must be a whole number between 0 and 10', { declaredBags: input.declaredBags })
    }
    record.declaredBags = input.declaredBags
    return view(record)
  }

  async function complete(id: string): Promise<BoardingPassView> {
    await tick()
    const record = checkInOf(id)
    const existing = passes.get(record.id)
    if (existing) return passView(existing)
    assertStarted(record, 'The boarding pass can only be issued while the check-in is open')
    if (!record.document) fail(409, 'INVALID_STATE', 'The travel document must be submitted before the boarding pass is issued')

    const flight = flightOf(record.flightId)
    assertWindowOpen(flight)
    const booking = bookingOf(record.bookingPassengerId)
    // No seat picked: any free standard seat.
    const seat = assignments.get(booking.bookingPassengerId) ?? assignAnyStandard(flight.id, booking, booking.specialAssistance.length > 0)
    const pass: MockPass = {
      id: `pass-mock-${(seq += 1)}`,
      checkInId: record.id,
      reference: newReference(),
      seatCode: seat.seatCode,
      boardingGroup: boardingGroupOf(booking),
      printedAt: null,
    }
    passes.set(record.id, pass)
    record.status = 'checked_in'
    record.checkedInAt = now().toISOString()
    return passView(pass)
  }

  async function boardingPass(id: string): Promise<BoardingPassView> {
    await tick()
    const record = checkInOf(id)
    const pass = passes.get(record.id)
    if (!pass) fail(404, 'NOT_FOUND', 'No boarding pass has been issued yet')
    return passView(pass)
  }

  return { start, get, submitDocument, seatMap, holdSeat, releaseSeat, confirmSeat, declareBags, complete, boardingPass }
}
