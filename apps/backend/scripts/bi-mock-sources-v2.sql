-- LOCAL ONLY. A second batch of mock source data for Feature 14 (BI), to exercise every BI tab. Run it after
-- bi-mock-sources.sql. It uses its own flights (numbers starting MB), so the two batches do not collide.
--
--   docker exec -i airline_postgres psql -U postgres -d airline_db -v ON_ERROR_STOP=1 < apps/backend/scripts/bi-mock-sources-v2.sql
--
-- What it adds on top of the first batch:
--   * Delays: about 40% of flights leave late. Late flights get a 'delayed' event with a disruption reason, so the
--     operations tab shows on-time performance and the causes of delay.
--   * Business cabin: every fourth booking is business class (24 seats, fares three times economy). Load factor by
--     cabin then has two cabins.
--   * Denied passengers: about 1 in 25 passengers who would board is refused at screening. They are counted as denied,
--     not boarded.
-- Days used: 3, 10, 17 and 24 of each month from Jan 2025 to Nov 2026 (552 flights on the 6 routes).
--
-- Runs in one transaction and refuses to run twice (it looks for flights numbered MB...).
-- Finance is not covered: Feature 4 does not yet compute revenue or refunds from the source tables (its code has a
-- TODO for that), so the Financial report can only show the monthly rows already in finance_monthly_summary.

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'airline_db' THEN
    RAISE EXCEPTION 'refusing to run: database is %, expected airline_db', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM flight WHERE flight_number LIKE 'MB%') THEN
    RAISE EXCEPTION 'this mock batch is already loaded (flights MB... exist); not loading it twice';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM flight WHERE flight_number LIKE 'MK%') THEN
    RAISE EXCEPTION 'run bi-mock-sources.sql first';
  END IF;
END $$;

CREATE TEMP TABLE mb_aircraft ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY tail_number) AS an FROM aircraft WHERE deleted_at IS NULL;

CREATE TEMP TABLE mb_routes ON COMMIT DROP AS
SELECT id AS route_id, row_number() OVER (ORDER BY origin, destination) AS ri FROM route;

CREATE TEMP TABLE mb_cust ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY id) AS cn FROM customer;

CREATE TEMP TABLE mb_dates ON COMMIT DROP AS
SELECT d::date AS service_date, row_number() OVER (ORDER BY d) AS di
FROM generate_series('2025-01-01'::date, '2026-11-22'::date, interval '1 day') AS d
WHERE extract(day FROM d) IN (3, 10, 17, 24);

CREATE TEMP TABLE mb_flights ON COMMIT DROP AS
SELECT gen_random_uuid() AS flight_id,
       'MB' || lpad((d.di * 10 + r.ri)::text, 5, '0') AS flight_number,
       d.service_date,
       r.route_id,
       r.ri,
       a.id AS aircraft_id,
       ((d.service_date + time '07:00') AT TIME ZONE 'UTC') + make_interval(hours => (r.ri - 1)::int) AS sched_dep
FROM mb_dates d
CROSS JOIN mb_routes r
JOIN mb_aircraft a ON a.an = ((r.ri - 1) % 6) + 1;

-- Delay per flight, from a hash of the flight number so it is the same on every run.
ALTER TABLE mb_flights ADD COLUMN h integer, ADD COLUMN delay_min integer, ADD COLUMN dep_at timestamptz,
                       ADD COLUMN sched_arr timestamptz, ADD COLUMN reason text;
UPDATE mb_flights
SET h = abs(hashtext(flight_number));
UPDATE mb_flights
SET delay_min = CASE WHEN h % 100 < 60 THEN h % 11
                     WHEN h % 100 < 90 THEN 16 + (h / 100) % 75
                     ELSE 12 + (h / 100) % 4 END,
    reason = (ARRAY['WX', 'TECH', 'CREW', 'ATC', 'SEC', 'APT', 'OTH'])[(h / 1000) % 7 + 1];
UPDATE mb_flights
SET dep_at = sched_dep + make_interval(mins => delay_min),
    sched_arr = sched_dep + interval '2 hours';

INSERT INTO flight (id, flight_number, service_date, route_id, scheduled_dep_at, scheduled_arr_at, dep_at, arr_at, aircraft_id, status)
SELECT flight_id, flight_number, service_date, route_id, sched_dep, sched_arr, dep_at, dep_at + interval '2 hours', aircraft_id, 'arrived'
FROM mb_flights;

-- Events: a 'delayed' event for each late flight (announced two hours before the scheduled departure), then the
-- departure and arrival.
INSERT INTO flight_event (id, flight_id, type, disruption_reason_code, delay_minutes, occurred_at)
SELECT gen_random_uuid(), flight_id, 'delayed', reason, delay_min, sched_dep - interval '2 hours'
FROM mb_flights WHERE delay_min > 15;

INSERT INTO flight_event (id, flight_id, type, occurred_at)
SELECT gen_random_uuid(), flight_id, ev, occurred_at
FROM (
  SELECT flight_id, 'departed' AS ev, dep_at AS occurred_at FROM mb_flights
  UNION ALL
  SELECT flight_id, 'arrived', dep_at + interval '2 hours' FROM mb_flights
) e;

CREATE TEMP TABLE mb_bk ON COMMIT DROP AS
SELECT f.flight_id, f.flight_number, f.route_id, f.ri, f.dep_at, f.sched_dep,
       (row_number() OVER (ORDER BY f.service_date, f.ri))::int AS n,
       gen_random_uuid() AS booking_id,
       gen_random_uuid() AS segment_id,
       gen_random_uuid() AS payment_id,
       CASE WHEN (row_number() OVER (ORDER BY f.service_date, f.ri))::int % 4 = 0 THEN 'business' ELSE 'economy' END AS cabin
FROM mb_flights f;

ALTER TABLE mb_bk ADD COLUMN ref text, ADD COLUMN booked_at timestamptz;
UPDATE mb_bk
SET booked_at = dep_at - make_interval(days => 1 + (n % 45)::int),
    ref = substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', ((n + 800000) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 800000) / 32) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 800000) / 1024) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 800000) / 32768) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 800000) / 1048576) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 800000) / 33554432) % 32) + 1, 1);

CREATE TEMP TABLE mb_pax ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO passenger (first_name, last_name)
  SELECT 'Demo', 'Traveller ' || g FROM generate_series(1, 60) AS g
  RETURNING id, last_name
)
SELECT id, row_number() OVER (ORDER BY last_name) AS pn FROM ins;

INSERT INTO booking (id, booking_reference, customer_id, trip_type, status, payment_type, currency, contact_email,
                     idempotency_key, booked_at, hold_expires_at, confirmed_at)
SELECT b.booking_id, b.ref, c.id, 'one_way', 'confirmed', 'cash', 'THB',
       'demo' || b.n || '@example.test', 'mock2-booking-' || b.n,
       b.booked_at, b.booked_at + interval '15 minutes', b.booked_at + interval '5 minutes'
FROM mb_bk b
JOIN mb_cust c ON c.cn = ((b.n - 1) % (SELECT count(*) FROM mb_cust)) + 1;

CREATE TEMP TABLE mb_bp ON COMMIT DROP AS
SELECT gen_random_uuid() AS bp_id, b.booking_id, b.n, b.segment_id, b.flight_id, p.id AS passenger_id, s.k AS slot
FROM mb_bk b
CROSS JOIN (VALUES (1), (2)) AS s(k)
JOIN mb_pax p ON p.pn = ((2 * b.n + s.k - 2) % 60) + 1;

INSERT INTO booking_passenger (id, booking_id, passenger_id, passenger_type)
SELECT bp_id, booking_id, passenger_id, 'adult' FROM mb_bp;

-- Coupons. Business fares are three times economy. About 8% are cancelled one day after booking.
CREATE TEMP TABLE mb_cp ON COMMIT DROP AS
SELECT gen_random_uuid() AS cp_id,
       bp.bp_id, bp.booking_id, bp.segment_id, bp.flight_id, bp.passenger_id, bp.slot, bp.n,
       b.dep_at, b.booked_at, b.ri, b.payment_id, b.cabin,
       ((2400 + b.ri * 350 + (bp.n % 5) * 150) * CASE WHEN b.cabin = 'business' THEN 3 ELSE 1 END)::numeric AS price_total,
       CASE WHEN (bp.n + bp.slot) % 12 = 0 THEN 'cancelled' ELSE 'confirmed' END AS status,
       row_number() OVER (ORDER BY bp.n, bp.slot) AS seq
FROM mb_bp bp
JOIN mb_bk b ON b.n = bp.n;

-- Seats, per flight and cabin, sold = confirmed coupons in that cabin. Created before the segments that point at them.
INSERT INTO seat_inventory (flight_id, cabin, capacity, held_count, sold_count, award_limit, award_held_count, award_sold_count)
SELECT f.flight_id, c.cabin, c.capacity, 0,
       count(cp.cp_id) FILTER (WHERE cp.status = 'confirmed'), 0, 0, 0
FROM mb_flights f
CROSS JOIN (VALUES ('economy', 150), ('business', 24)) AS c(cabin, capacity)
LEFT JOIN mb_cp cp ON cp.flight_id = f.flight_id AND cp.cabin = c.cabin
GROUP BY f.flight_id, c.cabin, c.capacity;

INSERT INTO booking_segment (id, booking_id, flight_id, segment_order, cabin)
SELECT segment_id, booking_id, flight_id, 1, cabin FROM mb_bk;

INSERT INTO booking_coupon (id, booking_id, booking_segment_id, booking_passenger_id, flight_id, passenger_id, price_total,
                            status, ticket_number, cancelled_at, cancel_reason)
SELECT cp_id, booking_id, segment_id, bp_id, flight_id, passenger_id, price_total,
       status, '8' || lpad(seq::text, 12, '0'),
       CASE WHEN status = 'cancelled' THEN booked_at + interval '1 day' END,
       CASE WHEN status = 'cancelled' THEN 'customer_request' END
FROM mb_cp;

-- Check-ins. About 90% of confirmed passengers come to the gate. Of those, about 1 in 25 is refused at screening.
-- A refused passenger has status 'denied' and a screening run id, and is not counted as boarded.
CREATE TEMP TABLE mb_ci ON COMMIT DROP AS
SELECT cp.cp_id, cp.bp_id, cp.passenger_id, cp.flight_id, cp.dep_at, cp.n, cp.slot,
       (cp.n + cp.slot) % 25 = 0 AS refused
FROM mb_cp cp
WHERE cp.status = 'confirmed' AND (cp.n + cp.slot) % 10 <> 0;

INSERT INTO check_in (id, booking_passenger_id, passenger_id, flight_id, status, checked_in_at, screening_run_id)
SELECT gen_random_uuid(), bp_id, passenger_id, flight_id,
       CASE WHEN refused THEN 'denied' ELSE 'boarded' END,
       CASE WHEN refused THEN NULL ELSE dep_at - interval '1 hour' END,
       CASE WHEN refused THEN gen_random_uuid() END
FROM mb_ci;

-- Gate closures. Boarded counts only passengers who boarded (denied ones are left out).
WITH bd AS (
  SELECT flight_id, count(*) AS boarded FROM check_in
  WHERE status = 'boarded' AND flight_id IN (SELECT flight_id FROM mb_flights)
  GROUP BY flight_id
)
INSERT INTO flight_boarding (flight_id, gate_id, closed_at, closed_by, sensor_count, manual_count, boarded_count)
SELECT f.flight_id,
       (SELECT id FROM gate ORDER BY code LIMIT 1 OFFSET (f.ri % 2)),
       f.sched_dep - interval '15 minutes',
       (SELECT id FROM staff LIMIT 1),
       coalesce(bd.boarded, 0), 0, coalesce(bd.boarded, 0)
FROM mb_flights f
LEFT JOIN bd ON bd.flight_id = f.flight_id;

-- Payments: one captured payment per booking, with its lines. Business fares are in the fare lines already.
CREATE TEMP TABLE mb_lines ON COMMIT DROP AS
SELECT gen_random_uuid() AS line_id, cp.payment_id, cp.booking_id, cp.cp_id AS coupon_id,
       'fare' AS line_type, 'Fare' AS description, cp.price_total AS amount, cp.status AS coupon_status, cp.n
FROM mb_cp cp
UNION ALL
SELECT gen_random_uuid(), b.payment_id, b.booking_id, NULL, 'baggage', 'Checked bags', 700, 'confirmed', b.n
FROM mb_bk b WHERE b.n % 10 < 3
UNION ALL
SELECT gen_random_uuid(), b.payment_id, b.booking_id, NULL, 'onboard_order', 'Onboard meals', 450, 'confirmed', b.n
FROM mb_bk b WHERE b.n % 4 = 0
UNION ALL
SELECT gen_random_uuid(), b.payment_id, b.booking_id, NULL, 'insurance', 'Travel insurance', 180, 'confirmed', b.n
FROM mb_bk b WHERE b.n % 7 = 0
UNION ALL
SELECT gen_random_uuid(), cp.payment_id, cp.booking_id, cp.cp_id, 'upgrade', 'Seat upgrade', 3000, cp.status, cp.n
FROM mb_cp cp WHERE cp.slot = 1 AND cp.n % 10 = 0 AND cp.cabin = 'economy';

INSERT INTO payment (id, source_feature, purchase_ref, idempotency_key, booking_id, payer_customer_id, status, provider,
                     currency, amount_total, card_amount, voucher_amount, started_at, expires_at, authorised_at, captured_at)
SELECT b.payment_id, 3, b.ref, 'mock2-pay-' || b.n, b.booking_id, bk.customer_id, 'captured', 'fake', 'THB',
       t.total, t.total, 0, b.booked_at, b.booked_at + interval '15 minutes',
       b.booked_at + interval '1 minute', b.booked_at + interval '2 minutes'
FROM mb_bk b
JOIN booking bk ON bk.id = b.booking_id
JOIN (SELECT payment_id, sum(amount) AS total FROM mb_lines GROUP BY payment_id) t ON t.payment_id = b.payment_id;

INSERT INTO payment_line (id, payment_id, line_type, description, amount, booking_id, booking_coupon_id, source_ref)
SELECT line_id, payment_id, line_type, description, amount, booking_id, coupon_id,
       CASE WHEN line_type = 'insurance' THEN 'insurance:' || booking_id END
FROM mb_lines;

WITH r AS (
  INSERT INTO refund (id, payment_id, source_key, reason, method, status, amount, requested_at, completed_at, fee_withheld, voucher_amount)
  SELECT gen_random_uuid(), l.payment_id, 'mk2-refund-' || l.line_id, 'customer_cancel', 'original', 'succeeded', l.amount,
         cp.booked_at + interval '1 day', cp.booked_at + interval '2 days', 0, 0
  FROM mb_lines l
  JOIN mb_cp cp ON cp.cp_id = l.coupon_id
  WHERE l.line_type = 'fare' AND l.coupon_status = 'cancelled'
  RETURNING id, payment_id, source_key
)
INSERT INTO refund_line (id, refund_id, payment_id, payment_line_id, amount)
SELECT gen_random_uuid(), r.id, r.payment_id, l.line_id, l.amount
FROM r
JOIN mb_lines l ON 'mk2-refund-' || l.line_id = r.source_key;

UPDATE payment_line pl
SET refunded_amount = pl.amount
WHERE pl.id IN (SELECT payment_line_id FROM refund_line);

COMMIT;

-- Row counts after loading.
SELECT 'flights' AS table_name, count(*) FROM flight WHERE flight_number LIKE 'MB%'
UNION ALL SELECT 'delayed events', count(*) FROM flight_event e JOIN flight f ON f.id = e.flight_id
          WHERE f.flight_number LIKE 'MB%' AND e.type = 'delayed'
UNION ALL SELECT 'business coupons', count(*) FROM booking_coupon c JOIN flight f ON f.id = c.flight_id
          JOIN booking_segment s ON s.id = c.booking_segment_id WHERE f.flight_number LIKE 'MB%' AND s.cabin = 'business'
UNION ALL SELECT 'denied check-ins', count(*) FROM check_in c JOIN flight f ON f.id = c.flight_id
          WHERE f.flight_number LIKE 'MB%' AND c.status = 'denied'
UNION ALL SELECT 'bookings', count(*) FROM booking WHERE idempotency_key LIKE 'mock2-booking-%';
