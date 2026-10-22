import { Body, Controller, Put, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { IdentitySetupDto } from './dto/identity-setup.dto'
import { PassengerProfilesService } from './passenger-profiles.service'

@Controller('customers')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }))
export class CustomerIdentityController {
  constructor(private readonly profiles: PassengerProfilesService) {}
  @Put('me/identity')
  setup(@CurrentUser() user: AuthenticatedUser, @Body() body: IdentitySetupDto) {
    return this.profiles.completeIdentitySetup(user.id, body)
  }
}
