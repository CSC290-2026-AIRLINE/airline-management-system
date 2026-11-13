// Read-only database checks. Build backend first, then run from the repository root:
// TS_NODE_PROJECT=apps/backend/tsconfig.json TS_NODE_BASEURL=apps/backend/dist node -r tsconfig-paths/register scripts/test-feature14-db.cjs
const assert = require("node:assert/strict");
const path = require("node:path");
const root = process.cwd();
process.loadEnvFile(path.join(root, "apps/backend/.env"));
const { DbService } = require(
  path.join(root, "apps/backend/dist/src/db/db.service.js"),
);
const { BiQueryService } = require(
  path.join(
    root,
    "apps/backend/dist/src/modules/bi-dashboards/bi-query.service.js",
  ),
);
const { BiFinanceService } = require(
  path.join(
    root,
    "apps/backend/dist/src/modules/bi-dashboards/bi-finance.service.js",
  ),
);
const { BiDashboardsController } = require(
  path.join(
    root,
    "apps/backend/dist/src/modules/bi-dashboards/bi-dashboards.controller.js",
  ),
);
const db = new DbService({ get: (key) => process.env[key] });
(async () => {
  try {
    await db.$connect();
    await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const query = new BiQueryService(tx);
        const finance = new BiFinanceService(tx);
        const api = new BiDashboardsController(
          { simulationNow: () => new Date().toISOString() },
          query,
          finance,
        );
        const status = await api.status();
        console.log(
          "status:",
          status.latest_success?.status ?? "no successful run",
          "refreshing:",
          status.refreshing,
        );
        const all = await query.dailyMetrics({});
        const filters = [
          {},
          { from: "2026-10-01", to: "2026-10-31", group: "week" },
          { from: "1900-01-01", to: "1900-01-02" },
        ];
        const routes = await query.routeMetrics({});
        if (routes[0])
          filters.push({
            route_id: routes[0].route_id,
            from: all[0]?.flight_date,
          });
        for (const filter of filters) {
          for (const mode of ["before_refunds", "after_refunds"]) {
            const f = { ...filter, revenue_mode: mode };
            const [
              kpis,
              daily,
              routes,
              series,
              cabins,
              bookings,
              sales,
              causes,
              flights,
            ] = await Promise.all([
              api.kpis(f),
              query.dailyMetrics(f),
              api.routes(f),
              api.series(f),
              api.cabins(f),
              api.bookingsSeries(f),
              api.bookings(f),
              api.delayCauses(f),
              api.flights(f),
            ]);
            assert.equal(
              kpis.kpis.flight_count,
              daily.reduce((n, r) => n + r.flight_count, 0),
            );
            assert.equal(
              kpis.kpis.flight_count,
              routes.reduce((n, r) => n + r.flight_count, 0),
            );
            assert.equal(
              kpis.kpis.flight_count,
              series.reduce((n, r) => n + r.flight_count, 0),
            );
            assert.equal(kpis.kpis.departed_count, flights.length);
            assert.equal(
              kpis.kpis.seat_available,
              cabins.reduce((n, r) => n + r.seat_available, 0),
            );
            assert.equal(
              bookings.reduce((n, r) => n + r.bookings, 0),
              sales.reduce((n, r) => n + r.booking_count, 0),
            );
            assert.equal(
              bookings.reduce((n, r) => n + r.cancellations, 0),
              sales.reduce((n, r) => n + r.cancellation_count, 0),
            );
            for (const chart of [
              "on-time",
              "load-factor",
              "revenue-per-seat",
              "bookings",
              "delay-causes",
              "cabins",
            ]) {
              const svg = await api.chart(chart, f);
              assert.match(svg, /<svg/);
              assert.doesNotMatch(svg, /NaN|Infinity/);
            }
            const res = { setHeader: () => {} };
            assert.match(await api.exportFlights(f, res), /^flight,date,route/);
            assert.match(
              await api.exportBookings(f, res),
              /^booking_date,origin,destination/,
            );
            for (const cabin of [
              "economy",
              "premium_economy",
              "business",
              "first",
            ]) {
              const rows = await api.flights({ ...f, cabin });
              assert(rows.every((r) => r.revenue === null));
            }
            for (const cause of [
              "weather",
              "technical",
              "crew",
              "air_traffic_control",
              "security",
              "airport_operations",
              "other",
            ]) {
              const rows = await api.flights({ ...f, cause });
              assert(rows.every((r) => r.cause === cause));
            }
            assert(causes.every((r) => r.events >= 0));
          }
        }
        const reports = await finance.months();
        for (const month of reports) {
          const report = await api.finance({ month });
          assert.equal(report.current.month, month);
          assert.match(
            await api.exportFinance({ month }, { setHeader: () => {} }),
            /^line,amount_thb/,
          );
        }
        await api.upcomingPayments();
        console.log(
          "PASS read-only database integration:",
          all.length,
          "daily rows,",
          routes.length,
          "routes,",
          reports.length,
          "finance months;",
          filters.length,
          "filter sets; all charts, CSVs, cabins and causes",
        );
      },
      { timeout: 60000 },
    );
  } finally {
    await db.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
