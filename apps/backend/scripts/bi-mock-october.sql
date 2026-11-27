-- LOCAL ONLY. Adds bookings, payments and extra items dated in October 2026, so the default month of the BI pages
-- (the previous month) has bookings, cancellations and extra revenue.
--
-- The first batches leave October 2026 almost empty: a few bookings, and no extra items. This batch adds three bookings
-- for each flight departing from 21 October 2026 onward, all booked between 1 and 20 October 2026. About half carry a
-- baggage line and a third carry an onboard meal line. The payments are captured on the booking date, so the extra
-- revenue for October is the money from these bookings.
--
--   docker exec -i airline_postgres psql -U postgres -d airline_db -v ON_ERROR_STOP=1 < apps/backend/scripts/bi-mock-october.sql
--
-- Run it after bi-mock-bookings-spread.sql. It runs in one transaction and refuses to run twice (bookings numbered
-- mock4-...).

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'airline_db' THEN
    RAISE EXCEPTION 'refusing to run: database is %, expected airline_db', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM booking WHERE idempotency_key LIKE 'mock4-booking-%') THEN
    RAISE EXCEPTION 'this batch is already loaded (mock4 bookings exist); not loading it twice';
  END IF;
END $$;

CREATE TEMP TABLE oc_cust ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY id) AS cn FROM customer;

CREATE TEMP TABLE oc_pax ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO passenger (first_name, last_name)
  SELECT 'October', 'Traveller ' || g FROM generate_series(1, 30) AS g
  RETURNING id, last_name
)
SELECT id, row_number() OVER (ORDER BY last_name) AS pn FROM ins;

CREATE TEMP TABLE oc_flights ON COMMIT DROP AS
SELECT f.id AS flight_id, f.dep_at, row_number() OVER (ORDER BY f.dep_at, f.flight_number) AS fn
FROM flight f
WHERE (f.flight_number LIKE 'MK%' OR f.flight_number LIKE 'MB%')
  AND f.dep_at >= timestamptz '2026-10-21 00:00+00';

CREATE TEMP TABLE oc_bk ON COMMIT DROP AS
SELECT (f.fn * 3 + s.k)::int AS n,
       f.flight_id,
       f.dep_at,
       gen_random_uuid() AS booking_id,
       gen_random_uuid() AS segment_id,
       gen_random_uuid() AS bp_id,
       gen_random_uuid() AS coupon_id,
       gen_random_uuid() AS payment_id,
       s.k
FROM oc_flights f
CROSS JOIN (VALUES (1), (2), (3)) AS s(k);

ALTER TABLE oc_bk ADD COLUMN ref text, ADD COLUMN booked_at timestamptz, ADD COLUMN passenger_id uuid,
                  ADD COLUMN customer_id uuid, ADD COLUMN price numeric;
UPDATE oc_bk
SET booked_at = timestamptz '2026-10-01 06:00+00' + make_interval(days => n % 20, hours => n % 12),
    ref = substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', ((n + 1500000) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 1500000) / 32) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 1500000) / 1024) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 1500000) / 32768) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 1500000) / 1048576) % 32) + 1, 1)
       || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (((n + 1500000) / 33554432) % 32) + 1, 1),
    price = 2600;

-- Booked before departure, always. The first booking dates are in October; departures are from 21 October.
UPDATE oc_bk SET booked_at = dep_at - interval '2 days'
WHERE booked_at >= dep_at;

UPDATE oc_bk b SET passenger_id = p.id FROM oc_pax p WHERE p.pn = (b.n % 30) + 1;
UPDATE oc_bk b SET customer_id = c.id FROM oc_cust c WHERE c.cn = (b.n - 1) % (SELECT count(*) FROM oc_cust) + 1;

INSERT INTO booking (id, booking_reference, customer_id, trip_type, status, payment_type, currency, contact_email,
                     idempotency_key, booked_at, hold_expires_at, confirmed_at)
SELECT booking_id, ref, customer_id, 'one_way', 'confirmed', 'cash', 'THB',
       'october' || n || '@example.test', 'mock4-booking-' || n,
       booked_at, booked_at + interval '15 minutes', booked_at + interval '5 minutes'
FROM oc_bk;

INSERT INTO booking_passenger (id, booking_id, passenger_id, passenger_type)
SELECT bp_id, booking_id, passenger_id, 'adult' FROM oc_bk;

UPDATE seat_inventory si
SET sold_count = si.sold_count + c.cnt
FROM (SELECT flight_id, count(*) AS cnt FROM oc_bk GROUP BY flight_id) c
WHERE si.flight_id = c.flight_id AND si.cabin = 'economy';

INSERT INTO booking_segment (id, booking_id, flight_id, segment_order, cabin)
SELECT segment_id, booking_id, flight_id, 1, 'economy' FROM oc_bk;

INSERT INTO booking_coupon (id, booking_id, booking_segment_id, booking_passenger_id, flight_id, passenger_id, price_total,
                            status, ticket_number)
SELECT coupon_id, booking_id, segment_id, bp_id, flight_id, passenger_id, price,
       'confirmed', '6' || lpad(n::text, 12, '0')
FROM oc_bk;

-- Each booking is paid on its booking date. The fare, then baggage for about half and a meal for a third.
CREATE TEMP TABLE oc_lines ON COMMIT DROP AS
SELECT gen_random_uuid() AS line_id, payment_id, booking_id, coupon_id, 'fare' AS line_type, 'Fare' AS description, price AS amount, n
FROM oc_bk
UNION ALL
SELECT gen_random_uuid(), payment_id, booking_id, NULL, 'baggage', 'Checked bags', 700, n FROM oc_bk WHERE n % 2 = 0
UNION ALL
SELECT gen_random_uuid(), payment_id, booking_id, NULL, 'onboard_order', 'Onboard meals', 450, n FROM oc_bk WHERE n % 3 = 0;

INSERT INTO payment (id, source_feature, purchase_ref, idempotency_key, booking_id, payer_customer_id, status, provider,
                     currency, amount_total, card_amount, voucher_amount, started_at, expires_at, authorised_at, captured_at)
SELECT b.payment_id, 3, b.ref, 'mock4-pay-' || b.n, b.booking_id, b.customer_id, 'captured', 'fake', 'THB',
       t.total, t.total, 0, b.booked_at, b.booked_at + interval '15 minutes',
       b.booked_at + interval '1 minute', b.booked_at + interval '2 minutes'
FROM oc_bk b
JOIN (SELECT payment_id, sum(amount) AS total FROM oc_lines GROUP BY payment_id) t ON t.payment_id = b.payment_id;

INSERT INTO payment_line (id, payment_id, line_type, description, amount, booking_id, booking_coupon_id)
SELECT line_id, payment_id, line_type, description, amount, booking_id, coupon_id FROM oc_lines;

COMMIT;

SELECT 'october bookings' AS table_name, count(*) FROM booking WHERE idempotency_key LIKE 'mock4-booking-%'
UNION ALL SELECT 'october extra lines', count(*) FROM oc_lines WHERE line_type <> 'fare';
