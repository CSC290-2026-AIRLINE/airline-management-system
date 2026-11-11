import { SetMetadata } from '@nestjs/common'

/** The metadata key the screen guard reads the required screen code from. */
export const REQUIRE_SCREEN = 'payments-refunds:require-screen'

/**
 * Names the admin-console screen a route needs.
 *
 * Feature 15 owns the role access matrix: an admin grants an `assignable` screen to a role on the Role access tab, and
 * `GET /api/me/screens` answers with the codes the signed-in user may open. This decorator puts that code on the route,
 * so the server checks the grant instead of trusting the frontend to hide the page.
 *
 * TODO(F5): Feature 5a has the same decorator and guard in `payments-checkout`. Once both branches are merged, keep one
 * copy in a shared place — not now, because a module may not import another module's internal files.
 *
 * @see apps/backend/src/modules/admin-console/contracts/README.md
 */
export const RequireScreen = (code: string): MethodDecorator & ClassDecorator => SetMetadata(REQUIRE_SCREEN, code)
