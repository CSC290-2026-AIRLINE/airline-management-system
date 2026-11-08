import type {
  BoardingEventRecord,
  BoardingPassRecord,
  CarryOnCheckRecord,
  CheckedBagRecord,
  CheckInPatch,
  CheckInRecord,
  CreateBagInput,
  CreateCheckInInput,
  CreateDocumentInput,
  CreatePassInput,
  FlightBoardingRecord,
  GateRecord,
  TravelDocumentRecord,
  UpdateBagPatch,
  UpdateDocumentPatch,
  UpdateFlightBoardingPatch,
  UpdatePassPatch,
  UpsertCarryOnCheckInput,
} from './checkin-store'

/** The token the services inject: the in-memory store today, the Prisma repository after the migration lands. */
export const CHECKIN_REPOSITORY = Symbol('CHECKIN_REPOSITORY')

/**
 * Everything feature 6 reads and writes, behind one async contract. The in-memory store answers straight away and
 * the Prisma implementation asks the database, so the services do not care which one they got.
 */
export interface CheckInRepository {
  createCheckIn(input: CreateCheckInInput): Promise<CheckInRecord>
  getCheckIn(id: string): Promise<CheckInRecord | null>
  updateCheckIn(id: string, patch: CheckInPatch): Promise<CheckInRecord>
  /** A check-in is cancelled, never deleted. */
  cancelCheckIn(id: string): Promise<CheckInRecord>
  findActiveCheckInByBookingPassenger(bookingPassengerId: string): Promise<CheckInRecord | null>
  listCheckIns(): Promise<CheckInRecord[]>
  listCheckInsByFlight(flightId: string): Promise<CheckInRecord[]>
  /** The check-ins of a flight; the pnr and the name are the booking's, the service filters those. */
  searchCheckIns(query: { flightId?: string; pnr?: string; name?: string }): Promise<CheckInRecord[]>

  createDocument(input: CreateDocumentInput): Promise<TravelDocumentRecord>
  getDocument(id: string): Promise<TravelDocumentRecord | null>
  getDocumentByCheckIn(checkInId: string): Promise<TravelDocumentRecord | null>
  listDocuments(): Promise<TravelDocumentRecord[]>
  updateDocument(id: string, patch: UpdateDocumentPatch): Promise<TravelDocumentRecord>

  createBag(input: CreateBagInput): Promise<CheckedBagRecord>
  getBag(id: string): Promise<CheckedBagRecord | null>
  listBags(checkInId: string): Promise<CheckedBagRecord[]>
  /** Feature 10 looks a bag up by the number on its tag. */
  findBagByTag(tagNumber: string): Promise<CheckedBagRecord | null>
  updateBag(id: string, patch: UpdateBagPatch): Promise<CheckedBagRecord>
  /** Soft delete: a tagged bag is never removed, the row stays for the audit. */
  deleteBag(id: string): Promise<CheckedBagRecord>
  nextBagTagSeq(): Promise<number>

  upsertCarryOnCheck(input: UpsertCarryOnCheckInput): Promise<CarryOnCheckRecord>
  getCarryOnCheck(checkInId: string): Promise<CarryOnCheckRecord | null>

  listGates(): Promise<GateRecord[]>
  getGate(id: string): Promise<GateRecord | null>
  flightBoarding(flightId: string): Promise<FlightBoardingRecord | null>
  upsertFlightBoarding(flightId: string, gateId: string): Promise<FlightBoardingRecord>
  updateFlightBoarding(flightId: string, patch: UpdateFlightBoardingPatch): Promise<FlightBoardingRecord>

  createPass(input: CreatePassInput): Promise<BoardingPassRecord>
  getPass(id: string): Promise<BoardingPassRecord | null>
  passByReference(reference: string): Promise<BoardingPassRecord | null>
  passesForCheckIn(checkInId: string): Promise<BoardingPassRecord[]>
  listPasses(): Promise<BoardingPassRecord[]>
  updatePass(id: string, patch: UpdatePassPatch): Promise<BoardingPassRecord>

  /** The unique index on the final events: a pass boards or no-shows exactly once. */
  appendEvent(input: Omit<BoardingEventRecord, 'id' | 'created_at'>): Promise<BoardingEventRecord>
  listEvents(flightId: string): Promise<BoardingEventRecord[]>
  hasFinalEvent(boardingPassId: string): Promise<boolean>
}
