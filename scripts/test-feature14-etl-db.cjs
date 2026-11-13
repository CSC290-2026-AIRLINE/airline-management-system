// Tests the real ETL SQL against temporary reporting tables; always rolls back.
// Build backend, then run from the repository root:
// TS_NODE_PROJECT=apps/backend/tsconfig.json TS_NODE_BASEURL=apps/backend/dist node -r tsconfig-paths/register scripts/test-feature14-etl-db.cjs
const assert = require("node:assert/strict");
const path = require("node:path");
const root = process.cwd();
process.loadEnvFile(path.join(root, "apps/backend/.env"));
const { DbService } = require(
  path.join(root, "apps/backend/dist/src/db/db.service.js"),
);
const { BiEtlService } = require(
  path.join(
    root,
    "apps/backend/dist/src/modules/bi-dashboards/bi-etl.service.js",
  ),
);
const db = new DbService({ get: (key) => process.env[key] });
const rollback = new Error("ROLLBACK_TEST");
(async () => {
  try {
    await db.$connect();
    const service = new BiEtlService(db, { now: () => new Date() });
    try {
      await db.$transaction(
        async (tx) => {
          // PostgreSQL resolves these session-local tables before public tables. The source is only read.
          for (const name of [
            "bi_route",
            "bi_flight",
            "bi_flight_cabin",
            "bi_flight_delay",
            "bi_booking_day",
            "bi_metric_day",
          ]) {
            await tx.$executeRawUnsafe(
              `CREATE TEMP TABLE ${name} (LIKE public.${name} INCLUDING ALL) ON COMMIT DROP`,
            );
            const table = await tx.$queryRawUnsafe(
              "SELECT c.relpersistence::text AS relpersistence FROM pg_class c WHERE c.oid = $1::regclass",
              name,
            );
            assert.equal(
              table[0].relpersistence,
              "t",
              `${name} must resolve to a temporary table`,
            );
          }
          const count = await service.rebuild(tx);
          const source = await tx.$queryRawUnsafe(
            "SELECT COUNT(*)::int AS count FROM flight",
          );
          assert.equal(count, source[0].count);
          const metrics = await tx.$queryRawUnsafe(
            "SELECT COALESCE(SUM(flight_count), 0)::int AS count FROM bi_metric_day",
          );
          assert.equal(count, metrics[0].count);
          console.log(
            `PASS real ETL SQL into temporary tables: ${count} source flights; permanent reporting tables untouched`,
          );
          throw rollback;
        },
        { timeout: 60000 },
      );
    } catch (error) {
      if (error !== rollback) throw error;
    }
  } finally {
    await db.$disconnect();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
