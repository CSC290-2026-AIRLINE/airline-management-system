// Component/async regression checks using installed TypeScript and node:test.
// Run: node scripts/test-feature14.cjs (no browser or additional packages required).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(
  __dirname,
  "../apps/staff-web/src/features/bi-dashboards",
);
const jsx = (type, props, key) => ({ type, props, key });
const ui = new Proxy({}, { get: (_, key) => String(key) });
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  vm.runInNewContext(
    code,
    {
      exports,
      URLSearchParams,
      Date,
      Promise,
      Error,
      console,
      require: (id) =>
        mocks[id] ??
        (id === "react/jsx-runtime"
          ? { jsx, jsxs: jsx, Fragment: "Fragment" }
          : ui),
      ...globals,
    },
    { filename: file },
  );
  return exports;
}
function elements(tree, predicate) {
  const result = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (predicate(node)) result.push(node);
    walk(node.props?.children);
  }
  walk(tree);
  return result;
}
const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function hooks() {
  const state = [],
    effects = [];
  let cursor = 0;
  return {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in state))
          state[index] = typeof initial === "function" ? initial() : initial;
        return [
          state[index],
          (next) => {
            state[index] =
              typeof next === "function" ? next(state[index]) : next;
          },
        ];
      },
      useEffect(callback, deps) {
        const index = cursor++;
        const before = effects[index];
        if (!before || deps.some((value, i) => value !== before.deps[i])) {
          before?.cleanup?.();
          effects[index] = { deps, callback };
        }
      },
    },
    render(fn) {
      cursor = 0;
      const result = fn();
      for (const effect of effects)
        if (effect?.callback) {
          effect.cleanup = effect.callback();
          effect.callback = null;
        }
      return result;
    },
    unmount() {
      effects.forEach((effect) => effect?.cleanup?.());
    },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

const apiModule = load("api/bi.ts", {
  "@staff-web/auth/AuthProvider": { useAppAuth: () => ({}) },
});
const comparison = load("lib-comparison.ts");
const period = load("lib-period.ts");
const filters = {
  from: "2026-09-01",
  to: "2026-09-30",
  group: "week",
  routeId: "route-1",
  revenueMode: "after_refunds",
};

test("filter serialization preserves route, cabin, delay cause and all-flight drill-down", () => {
  const params = new URLSearchParams(
    apiModule.filterQuery({
      ...filters,
      cabin: "business",
      cause: "weather",
      departedOnly: false,
    }),
  );
  assert.equal(params.get("route_id"), "route-1");
  assert.equal(params.get("departed_only"), "false");
  assert.equal(params.get("cabin"), "business");
  assert.equal(params.get("cause"), "weather");
  assert.equal(
    new URLSearchParams(
      apiModule.filterQuery(filters, { withRoute: false }),
    ).has("route_id"),
    false,
  );
});
test("bookings API preserves selected route; HTTP errors are surfaced", async () => {
  const calls = [];
  const api = load("api/bi.ts", {
    "@staff-web/auth/AuthProvider": {
      useAppAuth: () => ({
        fetchWithAuth: async (url) => {
          calls.push(url);
          return {
            ok: calls.length === 1,
            status: 503,
            text: async () => "Unavailable",
            json: async () => [],
          };
        },
      }),
    },
  }).useBiApi();
  await api.getBookingsByRoute(filters);
  assert.equal(
    new URL(calls[0], "http://test").searchParams.get("route_id"),
    "route-1",
  );
  await assert.rejects(api.getKpis(filters), /503: Unavailable/);
});
test("period boundaries cover leap years and weeks crossing years", () => {
  assert.equal(period.periodEnd("2024-02-01", "month"), "2024-02-29");
  assert.equal(period.periodEnd("2026-12-28", "week"), "2027-01-03");
  assert.equal(period.periodEnd("2026-09-07", "day"), "2026-09-07");
});
test("previous periods compare whole calendar months and equal-length partial ranges", () => {
  let result = comparison.previousFilters({
    ...filters,
    from: "2024-03-01",
    to: "2024-03-31",
  });
  assert.equal(result.from, "2024-02-01");
  assert.equal(result.to, "2024-02-29");
  result = comparison.previousFilters({
    ...filters,
    from: "2026-01-01",
    to: "2026-03-31",
  });
  assert.equal(result.from, "2025-10-01");
  assert.equal(result.to, "2025-12-31");
  result = comparison.previousFilters({
    ...filters,
    from: "2026-09-10",
    to: "2026-09-16",
  });
  assert.equal(result.from, "2026-09-03");
  assert.equal(result.to, "2026-09-09");
  assert.equal(
    comparison.previousFilters({ ...filters, from: "", to: "" }),
    null,
  );
  assert.equal(comparison.relativeChange(-50, -100), 0.5);
  assert.equal(comparison.relativeChange(10, 0), null);
  assert.match(comparison.comparison(0.025, "pts"), /2.5 pts/);
});
test("async loading clears stale figures, ignores late responses, retries and cleans up", async () => {
  const harness = hooks();
  const { useBiLoad } = load("hooks/useBiLoad.ts", { react: harness.react });
  const first = deferred(),
    second = deferred(),
    third = deferred();
  let request = 0;
  let key = "first";
  const loader = () => [first, second, third][request++].promise;
  const render = () => harness.render(() => useBiLoad(key, loader));
  assert.equal(render().loading, true);
  key = "second";
  assert.equal(render().data, null);
  first.resolve("stale");
  await tick();
  assert.equal(render().data, null);
  second.resolve("current");
  await tick();
  assert.equal(render().data, "current");
  render().retry();
  assert.equal(render().loading, true);
  assert.equal(render().data, null);
  third.reject(new Error("failed"));
  await tick();
  assert.equal(render().error, "failed");
  assert.equal(render().previousData, "current");
  harness.unmount();
});
test("returning to an earlier filter starts loading instead of displaying its old cached figures", async () => {
  const harness = hooks();
  const { useBiLoad } = load("hooks/useBiLoad.ts", { react: harness.react });
  let key = "A";
  let response = deferred();
  const render = () =>
    harness.render(() => useBiLoad(key, () => response.promise));
  render();
  response.resolve("old A");
  await tick();
  assert.equal(render().data, "old A");
  key = "B";
  response = deferred();
  render();
  key = "A";
  response = deferred();
  assert.equal(render().data, null);
  assert.equal(render().loading, true);
  response.resolve("new A");
  await tick();
  assert.equal(render().data, "new A");
  harness.unmount();
});

function dashboard({ failed, flightCount = 1, bookingCount = 5 } = {}) {
  const harness = hooks();
  const retries = {};
  const names = ["series", "cabins", "causes", "bookings", "previous"];
  let index = 0;
  const kpis = {
    flight_count: flightCount,
    on_time_pct: null,
    load_factor: null,
    revenue_per_seat: null,
  };
  const mocks = {
    react: harness.react,
    "@staff-web/auth/AuthProvider": { useAppAuth: () => ({ user: null }) },
    "../api/bi": { ...apiModule, useBiApi: () => ({}) },
    "../hooks/useBiDashboard": {
      useBiDashboard: () => ({
        data: { kpis: { kpis }, routes: [] },
        loading: false,
      }),
    },
    "../hooks/useBiLoad": {
      useBiLoad: () => {
        const name = names[index++];
        const retry = (retries[name] = () => {});
        return {
          data:
            name === failed || name === "previous"
              ? null
              : name === "bookings"
                ? [{ bookings: bookingCount, cancellations: 0 }]
                : [],
          error: name === failed ? "Request failed" : null,
          loading: false,
          retry,
        };
      },
    },
    "../lib-comparison": { ...comparison, defaultFilters: () => filters },
    "../lib-period": period,
    "../lib-format": load("lib-format.ts"),
    "../chart-colors": { BI_COLORS: {} },
  };
  const win = {
    location: { hash: "" },
    addEventListener() {},
    removeEventListener() {},
  };
  const { BiDashboardPage } = load("pages/BiDashboardPage.tsx", mocks, {
    window: win,
  });
  return {
    retries,
    render: () => {
      index = 0;
      return harness.render(BiDashboardPage);
    },
  };
}
for (const failed of ["series", "cabins", "bookings", "causes"])
  test(`${failed} failure has the correct error card and retry callback`, () => {
    const instance = dashboard({ failed });
    const tree = instance.render();
    const failures = elements(tree, (n) => n.type?.name === "LoadFailure");
    const expected =
      failed === "series"
        ? ["On-time performance", "Revenue per seat"]
        : failed === "cabins"
          ? ["Load factor by cabin"]
          : failed === "causes"
            ? ["Delay causes"]
            : ["Bookings vs cancellations"];
    assert.deepEqual(
      failures.map((n) => n.props.label),
      expected,
    );
    failures.forEach((n) =>
      assert.equal(n.props.onRetry, instance.retries[failed]),
    );
  });
test("bookings remain visible when there are no flights in the same date interval", () => {
  const tree = dashboard({ flightCount: 0 }).render();
  assert.equal(elements(tree, (n) => n.props?.kind === "bookings").length, 1);
  assert.equal(
    elements(
      tree,
      (n) =>
        n.type === "h2" &&
        n.props.children === "No flights for this route and dates",
    ).length,
    0,
  );
});
test("a truly empty interval displays the empty state", () => {
  const tree = dashboard({ flightCount: 0, bookingCount: 0 }).render();
  assert.equal(
    elements(
      tree,
      (n) =>
        n.type === "h2" &&
        n.props.children === "No flights for this route and dates",
    ).length,
    1,
  );
});
test("booking chart opens a booking-date panel; flight charts open flight panels", () => {
  const instance = dashboard();
  const tree = instance.render();
  elements(tree, (n) => n.props?.kind === "bookings")[0].props.onPick(
    "2026-09-07",
  );
  let next = instance.render();
  const panel = elements(
    next,
    (n) => n.props?.kind === "bookings" && n.props?.title,
  )[0];
  assert(panel);
  assert.equal(panel.type, "BookingDrillPanel");
  assert.equal(panel.props.filters.from, "2026-09-07");
  assert.equal(panel.props.filters.to, "2026-09-13");
  elements(next, (n) => n.props?.kind === "revenue")[0].props.onPick(
    "2026-09-07",
  );
  next = instance.render();
  assert.equal(
    elements(next, (n) => n.props?.kind === "period" && n.props?.title)[0].type,
    "DrillPanel",
  );
});
test("route options survive date filters and refresh never runs during read retries", async () => {
  const harness = hooks();
  const calls = [];
  let refreshes = 0;
  const api = {
    getStatus: async () => ({ refreshing: false }),
    getKpis: async () => ({}),
    getRoutes: async (f) => {
      calls.push(f);
      return [];
    },
    refresh: async () => {
      refreshes++;
    },
  };
  const { useBiDashboard } = load("hooks/useBiDashboard.ts", {
    react: harness.react,
    "../api/bi": { ...apiModule, useBiApi: () => api },
  });
  const render = () => harness.render(() => useBiDashboard(filters));
  render();
  await tick();
  assert.equal(render().loading, false);
  assert.equal(calls[0].from, "");
  assert.equal(calls[0].to, "");
  render().retry();
  await tick();
  assert.equal(refreshes, 0);
  await render().refresh();
  await tick();
  assert.equal(refreshes, 1);
  harness.unmount();
});
test("invalid date intervals make no dashboard requests", () => {
  const harness = hooks();
  const { useBiDashboard } = load("hooks/useBiDashboard.ts", {
    react: harness.react,
    "../api/bi": {
      ...apiModule,
      useBiApi: () => ({
        getStatus: () => {
          throw Error("should not request");
        },
      }),
    },
  });
  const result = harness.render(() =>
    useBiDashboard({ ...filters, from: "2026-10-01" }),
  );
  assert.equal(result.loading, false);
  assert.equal(result.error, null);
});

test("chart images release URLs and do not reuse a revoked image when filters return", async () => {
  const harness = hooks();
  const revoked = [];
  let count = 0;
  const { useChartImage } = load(
    "hooks/useChartImage.ts",
    {
      react: harness.react,
      "../api/bi": {
        ...apiModule,
        useBiApi: () => ({ getChartBlob: async () => ({}) }),
      },
    },
    {
      URL: {
        createObjectURL: () => `blob:${++count}`,
        revokeObjectURL: (url) => revoked.push(url),
      },
    },
  );
  let selection = filters;
  const render = () =>
    harness.render(() => useChartImage("on-time", selection));
  render();
  await tick();
  assert.equal(render().url, "blob:1");
  selection = { ...filters, routeId: "other" };
  render();
  selection = filters;
  assert.equal(render().url, null);
  await tick();
  assert.equal(render().url, "blob:2");
  harness.unmount();
  assert.deepEqual(revoked, ["blob:1", "blob:2"]);
});

test("scheduled refresh polling survives a transient read failure and stops when finished", async () => {
  const harness = hooks();
  let statusCalls = 0;
  let timer;
  let cleared = 0;
  const api = {
    getStatus: async () => {
      statusCalls++;
      if (statusCalls === 2) throw Error("Temporary outage");
      return { refreshing: statusCalls < 3 };
    },
    getKpis: async () => ({}),
    getRoutes: async () => [],
  };
  const { useBiDashboard } = load(
    "hooks/useBiDashboard.ts",
    {
      react: harness.react,
      "../api/bi": { ...apiModule, useBiApi: () => api },
    },
    {
      window: {
        setTimeout: (fn) => {
          timer = fn;
          return 1;
        },
        clearTimeout: () => {
          timer = null;
          cleared++;
        },
      },
    },
  );
  const render = () => harness.render(() => useBiDashboard(filters));
  render();
  await tick();
  render();
  assert.equal(typeof timer, "function");
  timer();
  render();
  await tick();
  assert.equal(render().error, "Temporary outage");
  assert.equal(typeof timer, "function");
  timer();
  render();
  await tick();
  assert.equal(render().data.status.refreshing, false);
  assert.equal(timer, null);
  assert(cleared > 0);
  harness.unmount();
});

const chartMocks = {
  react: { useId: () => "chart-test" },
  "../lib-format": load("lib-format.ts"),
  "../chart-colors": load("chart-colors.ts"),
};
const charts = load("components/InteractiveCharts.tsx", chartMocks);
function validCoordinates(tree) {
  const nodes = elements(tree, (n) =>
    ["rect", "circle", "line", "text", "path"].includes(n.type),
  );
  for (const { props } of nodes) {
    for (const key of [
      "x",
      "y",
      "x1",
      "x2",
      "y1",
      "y2",
      "width",
      "height",
      "cx",
      "cy",
    ]) {
      if (typeof props[key] === "number")
        assert(Number.isFinite(props[key]), `${key} must be finite`);
    }
    if (props.height !== undefined) assert(props.height >= 0);
    if (props.d !== undefined) assert.doesNotMatch(props.d, /NaN|Infinity/);
  }
  return nodes;
}
for (const values of [
  [0, 0],
  [-100, -50],
  [-50, 100],
])
  test(`revenue chart handles ${values.join(", ")} without invalid geometry`, () => {
    const tree = charts.PeriodBarChart({
      kind: "revenue",
      rows: values.map((value, i) => ({
        period: `2026-09-0${i + 1}`,
        revenue_per_seat: value,
      })),
      bookings: [],
      group: "day",
      mode: "after_refunds",
      onModeChange() {},
      onPick() {},
    });
    assert(validCoordinates(tree).length > 0);
  });
test("null on-time data and a load factor over 100% render safely", () => {
  validCoordinates(
    charts.OnTimeChart({
      rows: [{ period: "2026-09-01", on_time_pct: null }],
      group: "day",
      onPick() {},
    }),
  );
  assert(
    validCoordinates(
      charts.CabinChart({
        rows: [
          {
            cabin: "economy",
            label: "Economy",
            load_factor: 1.04,
            seat_sold: 104,
            seat_available: 100,
          },
        ],
        previous: [],
        onPick() {},
      }),
    ).length > 0,
  );
});
test("finance waterfall renders a loss below zero and supports zero revenue", () => {
  const { FinanceWaterfall } = load(
    "components/FinanceWaterfall.tsx",
    chartMocks,
  );
  assert(
    validCoordinates(
      FinanceWaterfall({
        steps: [
          { label: "Revenue", value: 0, total: true },
          { label: "Costs", value: -100 },
          { label: "Profit", value: -100, total: true },
        ],
      }),
    ).length > 0,
  );
});
test("chart drill-down supports Enter and Space without triggering on arrow keys", () => {
  let picked = 0;
  let prevented = 0;
  const tree = charts.ChartHit({
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    detail: "Test",
    onPick: () => picked++,
  });
  const rect = elements(tree, (n) => n.type === "rect")[0];
  for (const key of ["Enter", " ", "ArrowDown"])
    rect.props.onKeyDown({ key, preventDefault: () => prevented++ });
  assert.equal(picked, 2);
  assert.equal(prevented, 2);
});
