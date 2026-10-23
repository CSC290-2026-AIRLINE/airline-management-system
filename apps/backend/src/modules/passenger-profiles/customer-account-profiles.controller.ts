import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CreateSavedPassengerDto, ProfileUpdateDto, SavedPassengerQueryDto, UpdateSavedPassengerDto } from './dto/passenger-profiles.dto'
import { CustomerAccountProfilesService } from './customer-account-profiles.service'
import { ProfileIdentityService } from './profile-identity.service'

@Controller('customers')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }))
export class CustomerAccountProfilesController {
  constructor(
    private readonly profiles: CustomerAccountProfilesService,
    private readonly identity: ProfileIdentityService,
  ) {}

  @Post('me/sync-identity')
  @HttpCode(200)
  syncIdentity(@CurrentUser() user: AuthenticatedUser) {
    return this.identity.sync(user.id)
  }

  @Get('me')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.getProfile(user.id)
  }

  @Put('me')
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() body: ProfileUpdateDto) {
    return this.profiles.updateProfile(user.id, body)
  }

  @Put('me/photo')
  syncPhoto(@CurrentUser() user: AuthenticatedUser) {
    return this.identity.sync(user.id)
  }

  @Delete('me/photo')
  @HttpCode(204)
  async removePhoto(@CurrentUser() user: AuthenticatedUser) {
    await this.profiles.updateProfile(user.id, { profilePhotoUrl: null })
  }

  @Get('me/passengers')
  getPassengers(@CurrentUser() user: AuthenticatedUser, @Query() query: SavedPassengerQueryDto) {
    return this.profiles.listPassengers(user.id, query)
  }

  @Post('me/passengers')
  createPassenger(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateSavedPassengerDto) {
    return this.profiles.createPassenger(user.id, body)
  }

  @Put('me/passengers/:passengerId')
  updatePassenger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('passengerId', new ParseUUIDPipe()) passengerId: string,
    @Body() body: UpdateSavedPassengerDto,
  ) {
    return this.profiles.updatePassenger(user.id, passengerId, body)
  }

  @Delete('me/passengers/:passengerId')
  @HttpCode(204)
  async removePassenger(@CurrentUser() user: AuthenticatedUser, @Param('passengerId', new ParseUUIDPipe()) passengerId: string) {
    await this.profiles.removePassenger(user.id, passengerId)
  }
}
