/**
 * Imported first by `stripe-smoke.ts`: the environment is read when the app module loads, so the Stripe settings have to
 * be in place before that import runs. The values are made up; nothing here is a real key.
 */
export const WEBHOOK_SECRET = 'whsec_smoke_only'

process.env.PAYMENT_PROVIDER = 'stripe'
process.env.STRIPE_SECRET_KEY = 'sk_test_smoke_only'
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
