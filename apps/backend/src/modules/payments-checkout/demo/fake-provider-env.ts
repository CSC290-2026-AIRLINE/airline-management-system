/**
 * Imported first by a smoke script that must not depend on the developer's `.env`: the environment is read when the app
 * module loads, so the provider has to be chosen before that import runs. A variable already set in the process wins
 * over the `.env` file, so the smoke runs on the fake provider even when `.env` says `stripe`.
 *
 * The fake provider needs no account and no network, and it finishes a card refund on the spot.
 */
process.env.PAYMENT_PROVIDER = 'fake'

export {}
