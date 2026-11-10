import { SetMetadata } from '@nestjs/common'

/** The metadata key the screen guard reads the required screen code from. */
export const REQUIRE_SCREEN = 'payments-checkout:require-screen'

/**
 * Names the admin-console screen a route needs.
 *
 * Feature 15 owns the role access matrix: an admin grants an `assignable` screen to a role on the Role access tab
 * (`PUT /api/admin/roles/:id/screens`), and `GET /api/me/screens` then answers with the codes the signed-in user may
 * open. This decorator puts that code on the route, so the server checks the grant instead of trusting the frontend to
 * hide the page.
 *
 * @see apps/backend/src/modules/admin-console/contracts/README.md
 */
export const RequireScreen = (code: string): MethodDecorator & ClassDecorator => SetMetadata(REQUIRE_SCREEN, code)
