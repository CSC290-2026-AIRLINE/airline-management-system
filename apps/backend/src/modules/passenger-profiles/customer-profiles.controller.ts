import { Controller, Get, Param, ParseUUIDPipe, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { SearchCustomersDto } from './dto/search-customers.dto'
import { PassengerProfilesService } from './passenger-profiles.service'

/** `passenger.id` is a `@db.Uuid`, so a bad one is a client error rather than a Postgres cast failure. */
const CUSTOMER_ID_PIPE = new ParseUUIDPipe({ errorHttpStatusCode: 400 })

/**
 * Same pipe as `PassengerProfilesController`, and for the same reason: `main.ts` registers no
 * global pipe, so a controller without its own `@UsePipes` is silently unvalidated.
 */
const CUSTOMER_VALIDATION_PIPE = new ValidationPipe({ transform: true, whitelist: true })

/**
 * The account-holder side of the Feature 7 Artifact's route table, which lists `/staff/customers`
 * alongside `/staff/passengers`.
 *
 * These are real routes with their own query DTO rather than a client-side filter over the
 * passenger list. The filter happened to produce the same rows, but it also meant the contract
 * existed only in the browser: the Artifact's route was absent from the API, and a caller had no
 * documented way to ask for account holders that could not also return travellers.
 *
 * `:id` is the **passenger id** of the holder — the same id `GET /api/staff/passengers` and
 * `GET /api/staff/passengers/:id` use. An account holder is a passenger row that also owns a
 * `customer`, and reusing that id is what lets the staff-web client key a person by one id
 * regardless of which route loaded the row. A traveller id is a `404` here.
 *
 * Response shapes are unchanged from the passenger routes, and passports are masked by the same
 * `toSummary`, so the client maps both identically.
 *
 * The global `JwtAuthGuard` covers these routes exactly as it covers the passenger ones; there is
 * no `@Public()`. See the module README for the unenforced `S` staff-role gap.
 */
@UsePipes(CUSTOMER_VALIDATION_PIPE)
@Controller('staff/customers')
export class CustomerProfilesController {
  constructor(private readonly passengerProfiles: PassengerProfilesService) {}

  @Get()
  searchAccountHolders(@Query() query: SearchCustomersDto) {
    return this.passengerProfiles.searchAccountHolders(query)
  }

  @Get(':id')
  getAccountHolder(@Param('id', CUSTOMER_ID_PIPE) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.passengerProfiles.getAccountHolder(id, actor)
  }
}
