-- Feature 14 (Business Intelligence Dashboards), from the F14 Iteration-02 doc and the DB team's review. New tables
-- only.
-- Contents: the reporting copy the pipeline writes, its run log and its one setting. The extract queries, the roll-up
-- maths, the rates (computed from sums at read time), the exports and the stale-run cleanup are the backend's job.
-- Uses only staff (feature 1). No foreign keys to other features' tables:
-- each copied row keeps its source id as its key, so nothing in a source can ever be blocked by the copy.
-- The tables are in the public schema with a bi_ prefix, not in a separate bi schema: with a second schema, Prisma
-- refuses every existing model that has no @@schema attribute (84 errors on dev with Prisma 7.10).
-- Only the pipeline writes them. A run rebuilds every bi_ table except bi_etl_run in ONE transaction, with DELETE and
-- INSERT (never TRUNCATE, which locks out readers until commit), so the dashboards keep reading the previous copy until
-- the new one commits, and a failed run leaves it whole.
-- flight_date is feature 2's service_date (local date at the origin). booking_date is the local date at the route's
-- origin airport of the simulation-clock time. Money is NUMERIC in the base currency (feature 4's pricing_setting).
-- Feature 4's monthly finance is not copied: staff-web reads it through feature 4's service.

-- Settings -------------------------------------------------------------------------------------------------

-- Closed list of keys, like crew_setting. 15 minutes is the industry's on-time limit (D15).
CREATE TABLE bi_setting (
  key        TEXT PRIMARY KEY CHECK (key IN ('on_time_minutes')),
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES staff (id)
);

INSERT INTO bi_setting (key, value) VALUES ('on_time_minutes', '15');

-- Copy ------------------------------------------------------------------------------------------------------

-- Feature 2's routes, for the route filter.
CREATE TABLE bi_route (
  route_id    UUID PRIMARY KEY,                                -- feature 2's route.id
  origin      TEXT NOT NULL,                                   -- IATA codes
  destination TEXT NOT NULL,
  distance_km INTEGER NOT NULL CHECK (distance_km > 0),
  UNIQUE (origin, destination)
);

-- One row per feature 2 flight, cancelled ones included. actual_departure_at is the occurred_at of the flight's departed
-- event (feature 2 has no actual-departure column); delay_minutes is how late that was against scheduled_dep_at, 0 when
-- early. Revenue is the captured ticket money of the flight's coupons (feature 5's fare, award_fee and seat_fee lines)
-- without the taxes and surcharges (feature 4's pass-through), so it means what feature 4's revenue means; refund_amount
-- is the part of it refunded. Seats are in bi_flight_cabin, delays by cause in bi_flight_delay.
CREATE TABLE bi_flight (
  flight_id              UUID PRIMARY KEY,                     -- feature 2's flight.id
  route_id               UUID NOT NULL REFERENCES bi_route (route_id),
  flight_number          TEXT NOT NULL,
  flight_date            DATE NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN (
                           'scheduled', 'delayed', 'holding', 'diverted', 'cancelled', 'departed', 'arrived')),
  scheduled_departure_at TIMESTAMPTZ NOT NULL,
  actual_departure_at    TIMESTAMPTZ,
  delay_minutes          INTEGER CHECK (delay_minutes >= 0),
  revenue_amount         NUMERIC(12, 2) NOT NULL CHECK (revenue_amount >= 0),
  refund_amount          NUMERIC(12, 2) NOT NULL CHECK (refund_amount >= 0),
  UNIQUE (flight_number, flight_date),
  CHECK ((actual_departure_at IS NULL) = (delay_minutes IS NULL)),
  CHECK (status NOT IN ('departed', 'arrived') OR actual_departure_at IS NOT NULL),
  CHECK (status NOT IN ('scheduled', 'delayed', 'cancelled') OR actual_departure_at IS NULL),
  CHECK (refund_amount <= revenue_amount)
);

CREATE INDEX bi_flight_route_date_idx ON bi_flight (route_id, flight_date);
CREATE INDEX bi_flight_date_idx ON bi_flight (flight_date);

-- Seats per cabin, from feature 3's seat_inventory (capacity and sold_count, award seats included), so feature 9 is not
-- read. Load factor per cabin sums these; the flight's total is their sum.
CREATE TABLE bi_flight_cabin (
  flight_id      UUID NOT NULL REFERENCES bi_flight (flight_id),
  cabin          TEXT NOT NULL CHECK (cabin IN ('economy', 'premium_economy', 'business', 'first')),
  seat_available INTEGER NOT NULL CHECK (seat_available >= 0),
  seat_sold      INTEGER NOT NULL CHECK (seat_sold >= 0),
  PRIMARY KEY (flight_id, cabin)
);

-- One row per feature 2 delayed event: the minutes it added and its reason, with the reason's category copied so the
-- delay-cause chart never reads feature 2's disruption_reason. A delay with no reason counts as 'other'.
CREATE TABLE bi_flight_delay (
  event_id      UUID PRIMARY KEY,                              -- feature 2's flight_event.id
  flight_id     UUID NOT NULL REFERENCES bi_flight (flight_id),
  reason_code   TEXT,
  category      TEXT NOT NULL CHECK (category IN (
                  'weather', 'technical', 'crew', 'air_traffic_control', 'security', 'airport_operations', 'other')),
  delay_minutes INTEGER NOT NULL CHECK (delay_minutes > 0),
  CHECK (reason_code IS NOT NULL OR category = 'other')
);

CREATE INDEX bi_flight_delay_flight_idx ON bi_flight_delay (flight_id);

-- Sales per route and day, counted in coupons (one passenger on one flight), from feature 3. A coupon counts as booked on
-- its booking's confirmed_at (feature 3 has no confirm time per coupon) and as cancelled on its cancelled_at. A coupon
-- cancelled because it was changed is in neither count, so a change is not a cancellation plus a new booking.
CREATE TABLE bi_booking_day (
  route_id           UUID NOT NULL REFERENCES bi_route (route_id),
  booking_date       DATE NOT NULL,
  booking_count      INTEGER NOT NULL CHECK (booking_count >= 0),
  cancellation_count INTEGER NOT NULL CHECK (cancellation_count >= 0),
  PRIMARY KEY (route_id, booking_date)
);

-- Roll-up ---------------------------------------------------------------------------------------------------

-- The flight metrics per route and flight date, summed from bi_flight, bi_flight_cabin and bi_flight_delay in the same
-- transaction. Rates are computed from the sums at read time, and a week or month adds the days' sums (never averages
-- the days' rates):
--   on-time %        on_time_count / departed_count
--   load factor      seat_sold / seat_available
--   revenue per seat (revenue_amount - refund_amount) / seat_available, or before refunds without refund_amount
-- Seats, revenue and on-time count only flights that departed, so today's and future flights do not drag the rates down.
CREATE TABLE bi_metric_day (
  route_id        UUID NOT NULL REFERENCES bi_route (route_id),
  flight_date     DATE NOT NULL,
  flight_count    INTEGER NOT NULL CHECK (flight_count > 0),     -- every flight that day, cancelled included
  cancelled_count INTEGER NOT NULL CHECK (cancelled_count >= 0),
  departed_count  INTEGER NOT NULL CHECK (departed_count >= 0),
  on_time_count   INTEGER NOT NULL CHECK (on_time_count >= 0),   -- delay_minutes <= on_time_minutes
  delay_minutes   INTEGER NOT NULL CHECK (delay_minutes >= 0),
  seat_available  INTEGER NOT NULL CHECK (seat_available >= 0),
  seat_sold       INTEGER NOT NULL CHECK (seat_sold >= 0),
  revenue_amount  NUMERIC(14, 2) NOT NULL CHECK (revenue_amount >= 0),
  refund_amount   NUMERIC(14, 2) NOT NULL CHECK (refund_amount >= 0),
  PRIMARY KEY (route_id, flight_date),
  CHECK (cancelled_count + departed_count <= flight_count),
  CHECK (on_time_count <= departed_count),
  CHECK (departed_count > 0 OR (delay_minutes = 0 AND seat_available = 0 AND seat_sold = 0 AND revenue_amount = 0)),
  CHECK (refund_amount <= revenue_amount)
);

CREATE INDEX bi_metric_day_date_idx ON bi_metric_day (flight_date);

-- Runs ------------------------------------------------------------------------------------------------------

-- One row per pipeline run, written in its own short transaction before the rebuild and finished after it, so the page
-- can show "refreshing". One run at a time: a second Refresh is refused by the unique index (RUN_IN_PROGRESS). On
-- startup the backend fails any row still running (the process died during the run).
-- data_as_of is the simulation-clock time the run read the sources at; the page shows the latest successful run's.
-- started_at and finished_at are real time.
CREATE TABLE bi_etl_run (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger               TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual')),
  requested_by_staff_id UUID REFERENCES staff (id),
  status                TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  data_as_of            TIMESTAMPTZ NOT NULL,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at           TIMESTAMPTZ,
  row_count             INTEGER CHECK (row_count >= 0),
  error_message         TEXT,
  CHECK ((trigger = 'manual') = (requested_by_staff_id IS NOT NULL)),
  CHECK ((status = 'running') = (finished_at IS NULL)),
  CHECK (finished_at >= started_at),
  CHECK ((status = 'success') = (row_count IS NOT NULL)),
  CHECK ((status = 'failed') = (error_message IS NOT NULL))
);

CREATE UNIQUE INDEX bi_etl_run_one_running_uq ON bi_etl_run (status) WHERE status = 'running';
CREATE INDEX bi_etl_run_success_idx ON bi_etl_run (started_at DESC) WHERE status = 'success';

-- Read-only login for Power BI (only if the group picks it). Not part of the migration: a role is cluster-wide and needs
-- a password, so the infra lead runs this once per database:
--   CREATE ROLE bi_reader LOGIN PASSWORD '<from the team vault>';
--   GRANT SELECT ON bi_route, bi_flight, bi_flight_cabin, bi_flight_delay, bi_booking_day, bi_metric_day, bi_etl_run,
--                   finance_monthly_summary, payment_schedule TO bi_reader;
