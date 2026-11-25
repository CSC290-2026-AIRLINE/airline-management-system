import { IsOptional, IsString, Matches } from 'class-validator'

const IATA = /^[A-Za-z]{3}$/

/** Query of `GET /api/staff/baggage-flights`. The service repeats the check. */
export class ArrivalsQuery {
  @IsString()
  @Matches(IATA, { message: 'airport must be a 3-letter IATA code' })
  airport: string
}

/** Query of `GET /api/staff/baggage-flights/departures`. */
export class DeparturesQuery {
  @IsString()
  @Matches(IATA, { message: 'from must be a 3-letter IATA code' })
  from: string

  /** The web app sends `to=` when no destination is picked yet, so an empty value means "any". */
  @IsOptional()
  @IsString()
  @Matches(/^([A-Za-z]{3})?$/, { message: 'to must be a 3-letter IATA code' })
  to?: string
}
