import { Module } from '@nestjs/common'
import { BuildPairingController } from './build-pairing.controller'
import { BuildPairingService } from './build-pairing.service'

/**
 * Feature 8 · Step 2 — build pairings.
 *
 * Owns `pairing` and `pairing_leg`, and is the only step that writes the handover
 * into `roster_run` / `roster_run_pairing`. It imports nothing from the other four
 * steps — step 3 reads what this one committed through the database, not through an
 * imported service. `DbModule` is `@Global()`, so no import is needed for `DbService`.
 *
 * Routes are authenticated by default via the global `JwtAuthGuard`; none is `@Public()`.
 */
@Module({
  controllers: [BuildPairingController],
  providers: [BuildPairingService],
  exports: [BuildPairingService],
})
export class BuildPairingModule {}
