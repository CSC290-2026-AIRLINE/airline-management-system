-- LOCAL ONLY. Mock source data for testing Feature 14 (BI) across several months and years.
--
-- It writes into the SOURCE tables (flight, booking, check_in, payment, aircraft, ...), not into bi_*. The BI refresh
-- then copies them into bi_* on its own, the same way it copies real data. Run it once against the local airline_db:
--
--   docker exec -i airline_postgres psql -U postgres -d airline_db -v ON_ERROR_STOP=1 < apps/backend/scripts/bi-mock-sources.sql
--
-- What it adds: flights on the 6 existing routes, on days 1, 8, 15 and 22 of every month from Jan 2025 to Nov 2026
-- (552 flights), with one two-passenger booking per flight, check-ins for about 90% of passengers, gate closures,
-- payments (fares, baggage, meals, upgrades, insurance), refunds for cancelled coupons, and grounded or maintenance
-- periods. Booking references and ticket numbers follow the database formats.
--
-- Everything runs in one transaction: if any row breaks a rule, nothing is written. It refuses to run twice (it looks
-- for flights numbered MK...). To remove it, delete the MK flights and the rows that point to them, by hand.
--
-- Not covered: denied passengers (the check-in table needs a screening run for them), and aircraft flying during their
-- own maintenance periods (the mock does not check aircraft availability).

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'airline_db' THEN
    RAISE EXCEPTION 'refusing to run: database is %, expected airline_db', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM flight WHERE flight_number LIKE 'MK%') THEN
    RAISE EXCEPTION 'mock data is already loaded (flights MK... exist); not loading it twice';
  END IF;
END $$;

-- Reference rows the mock data hangs off.
CREATE TEMP TABLE mk_aircraft ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY tail_number) AS an FROM aircraft WHERE deleted_at IS NULL;

CREATE TEMP TABLE mk_routes ON COMMIT DROP AS
SELECT id AS route_id, row_number() OVER (ORDER BY origin, destination) AS ri FROM route;

CREATE TEMP TABLE mk_cust ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY id) AS cn FROM customer;

-- Service dates: days 1, 8, 15 and 22 of every month, Jan 2025 to Nov 2026.
CREATE TEMP TABLE mk_dates ON COMMIT DROP AS
SELECT d::date AS service_date, row_number() OVER (ORDER BY d) AS di
FROM generate_series('2025-01-01'::date, '2026-11-22'::date, interval '1 day') AS d
WHERE extract(day FROM d) IN (1, 8, 15, 22);

-- One flight per route per date. Route i uses aircraft ((i - 1) mod 6) + 1.
CREATE TEMP TABLE mk_flights ON COMMIT DROP AS
SELECT gen_random_uuid() AS flight_id,
       'MK' || lpad((d.di * 10 + r.ri)::text, 5, '0') AS flight_number,
       d.service_date,
       r.route_id,
       r.ri,
       a.id AS aircraft_id,
       ((d.service_date + time '06:00') AT TIME ZONE 'UTC') + make_interval(hours => (r.ri - 1)::int) AS sched_dep
FROM mk_dates d
CROSS JOIN mk_routes r
JOIN mk_aircraft a ON a.an = ((r.ri - 1) % 6) + 1;

ALTER TABLE mk_flights ADD COLUMN dep_at timestamptz, ADD COLUMN sched_arr timestamptz;
UPDATE mk_flights
SET dep_at = sched_dep + make_interval(mins => abs(hashtext(flight_number)) % 20),
    sched_arr = sched_dep + interval '2 hours';

INSERT INTO flight (id, flight_number, service_date, route_id, scheduled_dep_at, scheduled_arr_at, dep_at, arr_at, aircraft_id, status)
SELECT flight_id, flight_number, service_date, route_id, sched_dep, sched_arr, dep_at, dep_at + interval '2 hours', aircraft_id, 'arrived'
FROM mk_flights;

INSERT INTO flight_event (id, flight_id, type, occurred_at)
SELECT gen_random_uuid(), flight_id, ev, occurred_at
FROM (
  SELECT flight_id, flight_number, 'departed' AS ev, dep_at AS occurred_at FROM mk_flights
  UNION ALL
  SELECT flight_id, flight_number, 'arrived', dep_at + interval '2 hours' FROM mk_flights
) e;

-- One booking per flight, with a segment on that flight. Booking reference: six characters from the allowed alphabet,
-- built from a counter so every one is unique.
CREATE TEMP TABLE mk_bk ON COMMIT DROP AS
SELECT f.flight_id, f.flight_number, f.route_id, f.ri, f.dep_at,
       (row_number() OVER (ORDER BY f.service_date, f.ri))::int AS n,
       gen_random_uuid() AS booking_id,
       gen_random_uuid() AS segment_id,
       gen_random_uuid() AS payment_id
FROM mk_flights f;

ALTER TABLE mk_bk ADD COLUMN ref text, ADD COLUMN booked_at timestamptz;
UPDATE mk_bk
SET booked_at = dep_at - make_interval(days => 1 + (n % 45)::int),
    ref = substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', ((n + 500000) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 500000) / 32) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 500000) / 1024) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 500000) / 32768) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 500000) / 1048576) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 500000) / 33554432) % 32) + 1, 1);

-- Sixty mock passengers, shared across the bookings.
CREATE TEMP TABLE mk_pax ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO passenger (first_name, last_name)
  SELECT 'Mock', 'Traveller ' || g FROM generate_series(1, 60) AS g
  RETURNING id, last_name
)
SELECT id, row_number() OVER (ORDER BY last_name) AS pn FROM ins;

INSERT INTO booking (id, booking_reference, customer_id, trip_type, status, payment_type, currency, contact_email,
                     idempotency_key, booked_at, hold_expires_at, confirmed_at)
SELECT b.booking_id, b.ref, c.id, 'one_way', 'confirmed', 'cash', 'THB',
       'mock' || b.n || '@example.test', 'mock-booking-' || b.n,
       b.booked_at, b.booked_at + interval '15 minutes', b.booked_at + interval '5 minutes'
FROM mk_bk b
JOIN mk_cust c ON c.cn = ((b.n - 1) % (SELECT count(*) FROM mk_cust)) + 1;

INSERT INTO seat_inventory (flight_id, cabin, capacity, held_count, sold_count, award_limit, award_held_count, award_sold_count)
SELECT flight_id, 'economy', 150, 0, 0, 0, 0, 0 FROM mk_flights;

INSERT INTO booking_segment (id, booking_id, flight_id, segment_order, cabin)
SELECT segment_id, booking_id, flight_id, 1, 'economy' FROM mk_bk;

CREATE TEMP TABLE mk_bp ON COMMIT DROP AS
SELECT gen_random_uuid() AS bp_id, b.booking_id, b.n, b.segment_id, b.flight_id, p.id AS passenger_id, s.k AS slot
FROM mk_bk b
CROSS JOIN (VALUES (1), (2)) AS s(k)
JOIN mk_pax p ON p.pn = ((2 * b.n + s.k - 2) % 60) + 1;

INSERT INTO booking_passenger (id, booking_id, passenger_id, passenger_type)
SELECT bp_id, booking_id, passenger_id, 'adult' FROM mk_bp;

-- Coupons. About 8% are cancelled by the customer one day after booking (still before departure).
CREATE TEMP TABLE mk_cp ON COMMIT DROP AS
SELECT gen_random_uuid() AS cp_id,
       bp.bp_id, bp.booking_id, bp.segment_id, bp.flight_id, bp.passenger_id, bp.slot, bp.n,
       b.dep_at, b.booked_at, b.ri, b.payment_id,
       (2400 + b.ri * 350 + (bp.n % 5) * 150)::numeric AS price_total,
       CASE WHEN (bp.n + bp.slot) % 12 = 0 THEN 'cancelled' ELSE 'confirmed' END AS status,
       row_number() OVER (ORDER BY bp.n, bp.slot) AS seq
FROM mk_bp bp
JOIN mk_bk b ON b.n = bp.n;

INSERT INTO booking_coupon (id, booking_id, booking_segment_id, booking_passenger_id, flight_id, passenger_id, price_total,
                            status, ticket_number, cancelled_at, cancel_reason)
SELECT cp_id, booking_id, segment_id, bp_id, flight_id, passenger_id, price_total,
       status, '9' || lpad(seq::text, 12, '0'),
       CASE WHEN status = 'cancelled' THEN booked_at + interval '1 day' END,
       CASE WHEN status = 'cancelled' THEN 'customer_request' END
FROM mk_cp;

-- Check-ins: about 90% of confirmed passengers boarded. The rest have no check-in, so they count as no-shows.
INSERT INTO check_in (id, booking_passenger_id, passenger_id, flight_id, status, checked_in_at)
SELECT gen_random_uuid(), cp.bp_id, cp.passenger_id, cp.flight_id, 'boarded', cp.dep_at - interval '1 hour'
FROM mk_cp cp
WHERE cp.status = 'confirmed' AND (cp.n + cp.slot) % 10 <> 0;

-- Seats: economy, 150 seats per flight. Sold is filled in once the coupons exist.
UPDATE seat_inventory si
SET sold_count = s.sold
FROM (
  SELECT f.flight_id, count(cp.cp_id) FILTER (WHERE cp.status = 'confirmed') AS sold
  FROM mk_flights f
  LEFT JOIN mk_cp cp ON cp.flight_id = f.flight_id
  GROUP BY f.flight_id
) s
WHERE si.flight_id = s.flight_id AND si.cabin = 'economy';

-- Gate closures, 15 minutes before departure, alternating between the two gates.
WITH bd AS (
  SELECT flight_id, count(*) AS boarded FROM check_in
  WHERE status = 'boarded' AND flight_id IN (SELECT flight_id FROM mk_flights)
  GROUP BY flight_id
)
INSERT INTO flight_boarding (flight_id, gate_id, closed_at, closed_by, sensor_count, manual_count, boarded_count)
SELECT f.flight_id,
       (SELECT id FROM gate ORDER BY code LIMIT 1 OFFSET (f.ri % 2)),
       f.sched_dep - interval '15 minutes',
       (SELECT id FROM staff LIMIT 1),
       coalesce(bd.boarded, 0), 0, coalesce(bd.boarded, 0)
FROM mk_flights f
LEFT JOIN bd ON bd.flight_id = f.flight_id;

-- Payments: one captured payment per booking, with its lines.
CREATE TEMP TABLE mk_lines ON COMMIT DROP AS
SELECT gen_random_uuid() AS line_id, cp.payment_id, cp.booking_id, cp.cp_id AS coupon_id,
       'fare' AS line_type, 'Fare' AS description, cp.price_total AS amount, cp.status AS coupon_status, cp.n
FROM mk_cp cp
UNION ALL
SELECT gen_random_uuid(), b.payment_id, b.booking_id, NULL, 'baggage', 'Checked bags', 700, 'confirmed', b.n
FROM mk_bk b WHERE b.n % 10 < 3
UNION ALL
SELECT gen_random_uuid(), b.payment_id, b.booking_id, NULL, 'onboard_order', 'Onboard meals', 450, 'confirmed', b.n
FROM mk_bk b WHERE b.n % 4 = 0
UNION ALL
SELECT gen_random_uuid(), b.payment_id, b.booking_id, NULL, 'insurance', 'Travel insurance', 180, 'confirmed', b.n
FROM mk_bk b WHERE b.n % 7 = 0
UNION ALL
SELECT gen_random_uuid(), cp.payment_id, cp.booking_id, cp.cp_id, 'upgrade', 'Seat upgrade', 3000, cp.status, cp.n
FROM mk_cp cp WHERE cp.slot = 1 AND cp.n % 10 = 0;

INSERT INTO payment (id, source_feature, purchase_ref, idempotency_key, booking_id, payer_customer_id, status, provider,
                     currency, amount_total, card_amount, voucher_amount, started_at, expires_at, authorised_at, captured_at)
SELECT b.payment_id, 3, b.ref, 'mock-pay-' || b.n, b.booking_id, bk.customer_id, 'captured', 'fake', 'THB',
       t.total, t.total, 0, b.booked_at, b.booked_at + interval '15 minutes',
       b.booked_at + interval '1 minute', b.booked_at + interval '2 minutes'
FROM mk_bk b
JOIN booking bk ON bk.id = b.booking_id
JOIN (SELECT payment_id, sum(amount) AS total FROM mk_lines GROUP BY payment_id) t ON t.payment_id = b.payment_id;

INSERT INTO payment_line (id, payment_id, line_type, description, amount, booking_id, booking_coupon_id, source_ref)
SELECT line_id, payment_id, line_type, description, amount, booking_id, coupon_id,
       CASE WHEN line_type = 'insurance' THEN 'insurance:' || booking_id END
FROM mk_lines;

-- Refunds: every cancelled coupon's fare is refunded to the card.
WITH r AS (
  INSERT INTO refund (id, payment_id, source_key, reason, method, status, amount, requested_at, completed_at, fee_withheld, voucher_amount)
  SELECT gen_random_uuid(), l.payment_id, 'mk-refund-' || l.line_id, 'customer_cancel', 'original', 'succeeded', l.amount,
         cp.booked_at + interval '1 day', cp.booked_at + interval '2 days', 0, 0
  FROM mk_lines l
  JOIN mk_cp cp ON cp.cp_id = l.coupon_id
  WHERE l.line_type = 'fare' AND l.coupon_status = 'cancelled'
  RETURNING id, payment_id, source_key
)
INSERT INTO refund_line (id, refund_id, payment_id, payment_line_id, amount)
SELECT gen_random_uuid(), r.id, r.payment_id, l.line_id, l.amount
FROM r
JOIN mk_lines l ON 'mk-refund-' || l.line_id = r.source_key;

UPDATE payment_line pl
SET refunded_amount = pl.amount
WHERE pl.id IN (SELECT payment_line_id FROM refund_line);

-- Aircraft downtime: a short maintenance check in each aircraft's first year, a grounding for two of them, and a longer
-- maintenance period in 2026 for everyone.
INSERT INTO aircraft_status_period (aircraft_id, status, origin, reason, start_date, end_date, created_by)
SELECT a.id, 'in_maintenance', 'manual', 'a_check', d.s, d.s + 2, (SELECT id FROM staff LIMIT 1)
FROM mk_aircraft a
CROSS JOIN (VALUES (date '2025-03-10'), (date '2025-11-05'), (date '2026-06-15')) AS d(s);

INSERT INTO aircraft_status_period (aircraft_id, status, origin, reason, start_date, end_date, created_by)
SELECT a.id, 'grounded', 'manual', 'Technical snag', date '2025-08-01', date '2025-08-03', (SELECT id FROM staff LIMIT 1)
FROM mk_aircraft a WHERE a.an <= 2;

COMMIT;

-- Row counts after loading.
SELECT 'flights' AS table_name, count(*) FROM flight WHERE flight_number LIKE 'MK%'
UNION ALL SELECT 'bookings', count(*) FROM booking WHERE idempotency_key LIKE 'mock-booking-%'
UNION ALL SELECT 'coupons', count(*) FROM booking_coupon WHERE ticket_number LIKE '9%' AND booking_id IN (SELECT id FROM booking WHERE idempotency_key LIKE 'mock-booking-%')
UNION ALL SELECT 'check-ins', count(*) FROM check_in WHERE flight_id IN (SELECT id FROM flight WHERE flight_number LIKE 'MK%')
UNION ALL SELECT 'payments', count(*) FROM payment WHERE idempotency_key LIKE 'mock-pay-%'
UNION ALL SELECT 'refunds', count(*) FROM refund WHERE source_key LIKE 'mk-refund-%';
