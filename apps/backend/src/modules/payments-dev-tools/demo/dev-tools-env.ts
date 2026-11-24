/**
 * TODO(F5-dev): delete with the rest of `payments-dev-tools` before the PR merges.
 *
 * Imported first by `smoke.ts`: the environment is read when the app module loads. The tools are switched on, and the
 * fake provider is chosen so the run needs no Stripe account.
 */
process.env.PAYMENT_DEV_TOOLS = 'true'
process.env.PAYMENT_PROVIDER = 'fake'

export {}
