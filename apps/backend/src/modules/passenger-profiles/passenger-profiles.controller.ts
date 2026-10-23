import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CorrectIdentityDto } from './dto/correct-identity.dto'
import { CreatePassengerDto } from './dto/create-passenger.dto'
import { SearchPassengersDto } from './dto/search-passengers.dto'
import { PassengerProfilesService } from './passenger-profiles.service'

/**
 * `passenger.id` is a `@db.Uuid`, so a bad one is a client error rather than a Postgres
 * cast failure. Unversioned, because the seeded and shared ids are not all v4.
 */
const PASSENGER_ID_PIPE = new ParseUUIDPipe({ errorHttpStatusCode: 400 })

/**
 * Validates and normalises this module's bodies and queries. Scoped to the controller
 * rather than registered in `main.ts`, so it cannot affect another team's routes; a
 * controller without its own `@UsePipes` is simply unvalidated.
 *
 * `whitelist` drops properties the DTO does not declare, so a body cannot set fields the
 * route never reads — `PUT .../identity` relies on that to keep the correction to the
 * three identity-lock columns.
 */
const PASSENGER_VALIDATION_PIPE = new ValidationPipe({ transform: true, whitelist: true })

/**
 * Staff-facing passenger and customer-holder profiles.
 *
 * Mounted at `staff/passengers`, matching the Artifact's route table. The global prefix
 * `/api` supplies the leading `/api`.
 *
 * The global `JwtAuthGuard` already requires a Bearer token on every route here, so there
 * is no `@Public()` and no token handling of our own. The Artifact's `S` guard label is a
 * staff-role check; there is no role guard in this codebase and adding one is a
 * cross-cutting auth change, so every authenticated caller reaches these routes today.
 * That gap is reported in the module README rather than papered over here.
 *
 * Because of {@link PASSENGER_VALIDATION_PIPE} the parameters below are already-validated,
 * normalised DTO instances rather than raw request values.
 */
@UsePipes(PASSENGER_VALIDATION_PIPE)
@Controller('staff/passengers')
export class PassengerProfilesController {
  constructor(private readonly passengerProfiles: PassengerProfilesService) {}

  @Get()
  search(@Query() query: SearchPassengersDto) {
    return this.passengerProfiles.search(query)
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CreatePassengerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.passengerProfiles.create(body, actor)
  }

  @Get(':id')
  getProfile(@Param('id', PASSENGER_ID_PIPE) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.passengerProfiles.getProfile(id, actor)
  }

  /**
   * The Artifact writes updates with `PUT`, not `PATCH`, so this is `PUT`. The previous
   * `PATCH` route is gone rather than kept as an alias, so there is one documented shape
   * for the correction rather than two that can drift.
   */
  @Put(':id/identity')
  correctIdentity(@Param('id', PASSENGER_ID_PIPE) id: string, @Body() body: CorrectIdentityDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.passengerProfiles.correctIdentity(id, body, actor)
  }
}
