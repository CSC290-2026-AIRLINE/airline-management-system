#!/usr/bin/env node
// Forwards Stripe's webhooks to the local backend, so `npm run dev` can take a real test payment end to end.
//
// Stripe cannot reach localhost, so the Stripe CLI receives its events and forwards them to /api/webhooks/stripe. This runs
// beside the other dev servers and does nothing unless it is needed:
//   - PAYMENT_PROVIDER is not "stripe" (the default is the fake provider, which needs no webhooks): skipped.
//   - the Stripe CLI is not installed (it is the @stripe/cli dev dependency, so `npm install` gets it): says so, and skips.
// It reads apps/backend/.env the way the backend does (a variable already set in the shell wins) and never prints a key.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, "apps", "backend", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

// The project's own copy (@stripe/cli, installed by `npm install`), or one already on the PATH.
const local = path.join(root, "node_modules", ".bin", "stripe");
const stripe = existsSync(local) ? local : "stripe";

const say = (text) => console.log(`[stripe] ${text}`);
const events = [
  "payment_intent.amount_capturable_updated",
  "payment_intent.payment_failed",
  "checkout.session.expired",
  "refund.updated",
  "refund.failed",
].join(",");

if ((process.env.PAYMENT_PROVIDER ?? "fake") !== "stripe") {
  say(
    'skipped: PAYMENT_PROVIDER is not "stripe" (the fake provider needs no webhooks)',
  );
  process.exit(0);
}

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) {
  say(
    "skipped: STRIPE_SECRET_KEY must be a test key (sk_test_...) in apps/backend/.env",
  );
  process.exit(0);
}

if (spawnSync(stripe, ["--version"], { stdio: "ignore" }).error) {
  say(
    "skipped: the Stripe CLI is not installed. Run `npm install` (it is the @stripe/cli dev dependency), then rerun `npm run dev`.",
  );
  process.exit(0);
}

// The key goes in through the environment, not the command line, so it never shows in a process list.
const env = { ...process.env, STRIPE_API_KEY: key };

// The signing secret is the same every time for one account and machine. Say so if .env holds a different one.
const printed = spawnSync(stripe, ["listen", "--print-secret"], {
  env,
  encoding: "utf8",
});
const secret = printed.stdout?.trim();
if (
  secret?.startsWith("whsec_") &&
  secret !== (process.env.STRIPE_WEBHOOK_SECRET ?? "")
) {
  say(
    "STRIPE_WEBHOOK_SECRET in apps/backend/.env does not match the CLI's signing secret, so webhooks will be rejected.",
  );
  say(
    "Run `stripe listen --print-secret` (with your test key in STRIPE_API_KEY), put the whsec_ value in .env, and restart.",
  );
}

const port = process.env.PORT ?? "8080";
const child = spawn(
  "stripe",
  [
    "listen",
    "--events",
    events,
    "--forward-to",
    `localhost:${port}/api/webhooks/stripe`,
  ],
  {
    env,
    stdio: "inherit",
  },
);
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
