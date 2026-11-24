-- LOCAL ONLY. Adds bookings spread across the calendar, so the booking and cancellation chart has data in every month.
--
-- The first two batches (bi-mock-sources.sql, bi-mock-sources-v2.sql) put one booking on each flight, a fixed number of
-- days before departure. Those booking dates skip whole months (for example none fall in October 2026), so the chart
-- is empty for those months. This batch adds two single-passenger bookings to every existing flight, booked between
-- 1 and 240 days before departure, so the dates cover every month.
--
--   docker exec -i airline_postgres psql -U postgres -d airline_db -v ON_ERROR_STOP=1 < apps/backend/scripts/bi-mock-bookings-spread.sql
--
-- Run it after the first two batches. It runs in one transaction and refuses to run twice (it looks for bookings
-- numbered mock3-...). Each booking has a fare payment, so revenue stays consistent with the bookings.

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'airline_db' THEN
    RAISE EXCEPTION 'refusing to run: database is %, expected airline_db', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM booking WHERE idempotency_key LIKE 'mock3-booking-%') THEN
    RAISE EXCEPTION 'this batch is already loaded (mock3 bookings exist); not loading it twice';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM flight WHERE flight_number LIKE 'MK%') THEN
    RAISE EXCEPTION 'run bi-mock-sources.sql first';
  END IF;
END $$;

CREATE TEMP TABLE sp_cust ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY id) AS cn FROM customer;

-- Forty passengers for these bookings.
CREATE TEMP TABLE sp_pax ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO passenger (first_name, last_name)
  SELECT 'Spread', 'Traveller ' || g FROM generate_series(1, 40) AS g
  RETURNING id, last_name
)
SELECT id, row_number() OVER (ORDER BY last_name) AS pn FROM ins;

CREATE TEMP TABLE sp_flights ON COMMIT DROP AS
SELECT f.id AS flight_id, f.dep_at, row_number() OVER (ORDER BY f.flight_number, f.service_date) AS fn
FROM flight f
WHERE f.flight_number LIKE 'MK%' OR f.flight_number LIKE 'MB%';

-- Two bookings per flight. n is unique per booking; the offset in days is spread over 1 to 240 days.
CREATE TEMP TABLE sp_bk ON COMMIT DROP AS
SELECT (f.fn * 2 + s.k)::int AS n,
       f.flight_id,
       f.dep_at,
       gen_random_uuid() AS booking_id,
       gen_random_uuid() AS segment_id,
       gen_random_uuid() AS bp_id,
       gen_random_uuid() AS coupon_id,
       gen_random_uuid() AS payment_id,
       s.k
FROM sp_flights f
CROSS JOIN (VALUES (1), (2)) AS s(k);

ALTER TABLE sp_bk ADD COLUMN ref text, ADD COLUMN booked_at timestamptz, ADD COLUMN passenger_id uuid,
                  ADD COLUMN customer_id uuid, ADD COLUMN price numeric, ADD COLUMN seq bigint;
UPDATE sp_bk
SET booked_at = dep_at - make_interval(days => 1 + (n * 37) % 240),
    ref = substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', ((n + 1200000) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 1200000) / 32) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 1200000) / 1024) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 1200000) / 32768) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 1200000) / 1048576) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 1200000) / 33554432) % 32) + 1, 1),
    price = 2600,
    seq = n;

UPDATE sp_bk b
SET passenger_id = p.id
FROM sp_pax p
WHERE p.pn = (b.n % 40) + 1;

UPDATE sp_bk b
SET customer_id = c.id
FROM sp_cust c
WHERE c.cn = (b.n - 1) % (SELECT count(*) FROM sp_cust) + 1;

INSERT INTO booking (id, booking_reference, customer_id, trip_type, status, payment_type, currency, contact_email,
                     idempotency_key, booked_at, hold_expires_at, confirmed_at)
SELECT booking_id, ref, customer_id, 'one_way', 'confirmed', 'cash', 'THB',
       'spread' || n || '@example.test', 'mock3-booking-' || n,
       booked_at, booked_at + interval '15 minutes', booked_at + interval '5 minutes'
FROM sp_bk;

INSERT INTO booking_passenger (id, booking_id, passenger_id, passenger_type)
SELECT bp_id, booking_id, passenger_id, 'adult' FROM sp_bk;

-- Seats: add the two new economy sales to each flight.
UPDATE seat_inventory si
SET sold_count = si.sold_count + c.cnt
FROM (SELECT flight_id, count(*) AS cnt FROM sp_bk GROUP BY flight_id) c
WHERE si.flight_id = c.flight_id AND si.cabin = 'economy';

INSERT INTO booking_segment (id, booking_id, flight_id, segment_order, cabin)
SELECT segment_id, booking_id, flight_id, 1, 'economy' FROM sp_bk;

INSERT INTO booking_coupon (id, booking_id, booking_segment_id, booking_passenger_id, flight_id, passenger_id, price_total,
                            status, ticket_number)
SELECT coupon_id, booking_id, segment_id, bp_id, flight_id, passenger_id, price,
       'confirmed', '7' || lpad(seq::text, 12, '0')
FROM sp_bk;

INSERT INTO payment (id, source_feature, purchase_ref, idempotency_key, booking_id, payer_customer_id, status, provider,
                     currency, amount_total, card_amount, voucher_amount, started_at, expires_at, authorised_at, captured_at)
SELECT payment_id, 3, ref, 'mock3-pay-' || n, booking_id, customer_id, 'captured', 'fake', 'THB',
       price, price, 0, booked_at, booked_at + interval '15 minutes',
       booked_at + interval '1 minute', booked_at + interval '2 minutes'
FROM sp_bk;

INSERT INTO payment_line (id, payment_id, line_type, description, amount, booking_id, booking_coupon_id)
SELECT gen_random_uuid(), payment_id, 'fare', 'Fare', price, booking_id, coupon_id FROM sp_bk;

COMMIT;

SELECT 'spread bookings' AS table_name, count(*) FROM booking WHERE idempotency_key LIKE 'mock3-booking-%';
