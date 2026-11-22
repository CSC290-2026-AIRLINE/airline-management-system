import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { SCREEN_CODE } from '../dto/register-screen.dto'
import { REQUIRE_SCREEN_KEY, ScreenAccessGuard } from '../guards/screen-access.guard'

/**
 * Protects a route (or a whole controller) with the per-screen access set in Role access. The caller must be an active
 * staff account whose role can open `screenCode`; anyone else gets a 403 and an `access_denied` row in the audit log.
 *
 *   @Module({ imports: [AdminConsoleModule] })   // or AuditModule
 *   export class PricingModule {}
 *
 *   @Controller('staff/fare-classes')
 *   @RequireScreen('f04.fare_setup')
 *   export class FareClassController { ... }
 *
 * On a method it overrides the controller's screen. Use the code the feature registered for the page that calls the
 * route. The handler can read what the guard resolved from `req.screenAccess` (`ScreenAccess`).
 */
export function RequireScreen(screenCode: string): ClassDecorator & MethodDecorator {
  if (!SCREEN_CODE.test(screenCode)) {
    // Fails at boot, not on the first request.
    throw new Error(`@RequireScreen('${screenCode}'): a screen code looks like f04.fare_setup`)
  }
  return applyDecorators(SetMetadata(REQUIRE_SCREEN_KEY, screenCode), UseGuards(ScreenAccessGuard))
}
