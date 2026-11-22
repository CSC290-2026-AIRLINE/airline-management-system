-- Feature 14 Business Intelligence Dashboards: extra data (3 new tabs).
--   No-shows      from feature 3 booking_coupon, feature 6 check_in and flight_boarding
--   Extra revenue from feature 5 payment_line, payment, refund, refund_line
--   Aircraft use  from feature 9 aircraft, aircraft_type, aircraft_status_period, aircraft_maintenance
--                 and feature 2 flight (aircraft_id) and flight_event (departed, arrived)
--
-- Only F14's own bi_ tables change. No other feature's table is touched.
--
-- Every bi_ table is a copy that each refresh deletes and rebuilds. So this migration empties the copy first:
-- the new columns can then be NOT NULL without a backfill. Run one refresh after migrating to fill it again.
-- bi_etl_run (run history) and bi_setting are kept.

DELETE FROM bi_metric_day;
DELETE FROM bi_booking_day;
DELETE FROM bi_flight_delay;
DELETE FROM bi_flight_cabin;
DELETE FROM bi_flight;
DELETE FROM bi_route;


-- ===== Aircraft use =====

-- One row per aircraft in feature 9. A soft-deleted aircraft is copied only if a flight still points to it.
-- No date CHECK here: feature 9 does not enforce retired_on >= entry_into_service_date, and a copy must never reject
-- what its source accepts (one bad row would fail every refresh).
CREATE TABLE bi_aircraft (
  aircraft_id     UUID PRIMARY KEY,                             -- feature 9's aircraft.id
  tail_number     TEXT NOT NULL,
  type_code       TEXT NOT NULL,                                -- feature 9's aircraft_type.code
  in_service_from DATE NOT NULL,                                -- aircraft.entry_into_service_date
  retired_on      DATE                                          -- last day in the fleet; NULL = still flying
);

-- Days an aircraft could not fly: feature 9's live 'grounded' and 'in_maintenance' periods ('in_service' is left out).
-- Only periods that started by "data as of". An open-ended or future end is cut off at the "data as of" date,
-- so a day is never counted as "out" before it has happened.
CREATE TABLE bi_aircraft_downtime (
  period_id   UUID PRIMARY KEY,                                 -- feature 9's aircraft_status_period.id
  aircraft_id UUID NOT NULL REFERENCES bi_aircraft (aircraft_id),
  status      TEXT NOT NULL CHECK (status IN ('grounded', 'in_maintenance')),
  reason      TEXT,                                             -- maintenance_type (a_check, ...) or the period's reason
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,                                    -- inclusive, same as feature 9
  CHECK (end_date >= start_date)                                -- the refresh makes end_date, so this cannot fail on source data
);

CREATE INDEX bi_aircraft_downtime_aircraft_idx ON bi_aircraft_downtime (aircraft_id, start_date);


-- ===== New columns on bi_flight =====

ALTER TABLE bi_flight
  -- Aircraft use: the aircraft that flies it now.
  ADD COLUMN aircraft_id    UUID NOT NULL REFERENCES bi_aircraft (aircraft_id),
  -- Block time, gate to gate: from the flight's 'departed' event to its 'arrived' event. Feature 2's simulation-clock
  -- job writes these at the flight's dep_at and arr_at, which are timetable (gate) times. NULL until it has arrived.
  ADD COLUMN block_minutes  INTEGER CHECK (block_minutes > 0),
  -- No-shows, counted only once the gate has closed (feature 6 flight_boarding.closed_at is set). All four are NULL
  -- before that, and for a cancelled flight, so the flight is left out of the no-show rate instead of counting as 0%.
  -- A flight that leaves without a gate close stays NULL.
  -- The counts are a snapshot of the coupons live when the gate closed, so a later cancel or refund does not change them:
  --   booked_count  = feature 3 booking_coupon rows on the flight that are 'confirmed', or 'cancelled' after closed_at
  --   boarded_count = those coupons whose feature 6 check_in is 'boarded'
  --   denied_count  = those coupons whose feature 6 check_in is 'denied' (refused by feature 7 screening)
  --   no_show_count = booked - boarded - denied (set by the refresh; boarded and denied are subsets of booked, so it
  --                   cannot go below 0)
  ADD COLUMN booked_count   INTEGER CHECK (booked_count >= 0),
  ADD COLUMN boarded_count  INTEGER CHECK (boarded_count >= 0),
  ADD COLUMN denied_count   INTEGER CHECK (denied_count >= 0),
  ADD COLUMN no_show_count  INTEGER CHECK (no_show_count >= 0),
  -- These three CHECKs compare only columns the refresh fills from the same feature 2 flight row (block_minutes and
  -- actual_departure_at both need its departed event; the counts are NULL whenever status is 'cancelled'), so they
  -- cannot reject source data.
  ADD CONSTRAINT bi_flight_block_after_departure_ck CHECK (block_minutes IS NULL OR actual_departure_at IS NOT NULL),
  ADD CONSTRAINT bi_flight_boarding_counts_ck CHECK (
    (booked_count IS NULL) = (boarded_count IS NULL)
    AND (boarded_count IS NULL) = (denied_count IS NULL)
    AND (denied_count IS NULL) = (no_show_count IS NULL)),
  ADD CONSTRAINT bi_flight_boarding_not_cancelled_ck CHECK (status <> 'cancelled' OR booked_count IS NULL);

CREATE INDEX bi_flight_aircraft_date_idx ON bi_flight (aircraft_id, flight_date);


-- ===== New columns on bi_metric_day =====

-- No-shows per route and day: sums of the bi_flight counts over flights whose gate has closed (NULL counts add 0).
ALTER TABLE bi_metric_day
  ADD COLUMN booked_count  INTEGER NOT NULL CHECK (booked_count >= 0),
  ADD COLUMN boarded_count INTEGER NOT NULL CHECK (boarded_count >= 0),
  ADD COLUMN denied_count  INTEGER NOT NULL CHECK (denied_count >= 0),
  ADD COLUMN no_show_count INTEGER NOT NULL CHECK (no_show_count >= 0);


-- ===== Extra revenue =====

-- Baggage, upgrade, onboard food and insurance on paid payments ('captured' or 'reversed', the same rule as the
-- revenue on bi_flight). fare, award_fee and seat_fee stay in bi_flight's revenue, and cargo is left out, so nothing
-- is counted twice. Refunds are the 'succeeded' refund_line amounts on those lines, the same rule as bi_flight.
-- Grouped by the payment's captured date in Asia/Bangkok (the airline's home time zone); a refund stays on the date of
-- the sale it refunds. No route: bags and insurance are not tied to one flight.
CREATE TABLE bi_extra_revenue_day (
  revenue_date  DATE NOT NULL,
  line_type     TEXT NOT NULL CHECK (line_type IN ('baggage', 'upgrade', 'onboard_order', 'insurance')),
  line_count    INTEGER NOT NULL CHECK (line_count > 0),          -- how many were sold
  amount        NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  refund_amount NUMERIC(14, 2) NOT NULL CHECK (refund_amount >= 0),
  PRIMARY KEY (revenue_date, line_type)
  -- No refund_amount <= amount CHECK: feature 5 does not tie refund_line sums to the line's amount, and the copy must
  -- not reject what its source accepts.
);
