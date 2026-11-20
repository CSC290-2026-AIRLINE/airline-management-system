import { FullPassportAccess, StaffProfilesGuard } from './staff-profiles.guard'
import { F7ExceptionFilter, F7ValidationPipe } from '@backend/modules/passenger-profiles/f7-exception.filter'
import { UseGuards, UseFilters, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UsePipes } from '@nestjs/common'
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
const PASSENGER_VALIDATION_PIPE = new F7ValidationPipe({ transform: true, whitelist: true })

/**
 * Staff-facing passenger and customer-holder profiles.
 *
 * Mounted at `staff/passengers`, matching the Artifact's route table. The global prefix
 * `/api` supplies the leading `/api`.
 *
 * The global JWT guard authenticates the caller. StaffProfilesGuard then requires
 * an active staff account; customer tokens are rejected. No Security role is required.
 *
 * Because of {@link PASSENGER_VALIDATION_PIPE} the parameters below are already-validated,
 * normalised DTO instances rather than raw request values.
 */
@UsePipes(PASSENGER_VALIDATION_PIPE)
@UseFilters(F7ExceptionFilter)
@UseGuards(StaffProfilesGuard)
@Controller('staff/passengers')
export class PassengerProfilesController {
  constructor(private readonly passengerProfiles: PassengerProfilesService) {}

  @Get()
  search(@Query() query: SearchPassengersDto, @FullPassportAccess() fullPassport: boolean) {
    return this.passengerProfiles.search(query, fullPassport)
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CreatePassengerDto, @CurrentUser() actor: AuthenticatedUser, @FullPassportAccess() fullPassport: boolean) {
    return this.passengerProfiles.create(body, actor, fullPassport)
  }

  @Get(':id')
  getProfile(
    @Param('id', PASSENGER_ID_PIPE) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @FullPassportAccess() fullPassport: boolean,
  ) {
    return this.passengerProfiles.getProfile(id, actor, fullPassport)
  }

  /**
   * The Artifact writes updates with `PUT`, not `PATCH`, so this is `PUT`. The previous
   * `PATCH` route is gone rather than kept as an alias, so there is one documented shape
   * for the correction rather than two that can drift.
   */
  @Put(':id/identity')
  correctIdentity(
    @Param('id', PASSENGER_ID_PIPE) id: string,
    @Body() body: CorrectIdentityDto,
    @CurrentUser() actor: AuthenticatedUser,
    @FullPassportAccess() fullPassport: boolean,
  ) {
    return this.passengerProfiles.correctIdentity(id, body, actor, fullPassport)
  }
}
