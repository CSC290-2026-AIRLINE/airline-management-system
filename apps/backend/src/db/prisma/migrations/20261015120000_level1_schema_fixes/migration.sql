-- Follow-up fixes to the Level 1 schema. src/db/schema.sql already contains them.

-- The publisher sends pending outbox rows in seq order. seq is taken when the outbox row is inserted, inside the
-- same flight lock as the event, so it is monotonic per flight. The old index was on the random event_id.
ALTER TABLE flight_event_outbox ADD COLUMN seq BIGINT GENERATED ALWAYS AS IDENTITY;
DROP INDEX flight_event_outbox_pending_idx;
CREATE INDEX flight_event_outbox_pending_idx ON flight_event_outbox (seq) WHERE published_at IS NULL;

-- flight_event blocked UPDATE and DELETE but not TRUNCATE, unlike audit_log and stock_movement.
CREATE TRIGGER flight_event_no_truncate
  BEFORE TRUNCATE ON flight_event
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- lpad cuts longer strings, so the 10000th code came out as 'ST-1000' again. Pad to 4 digits but never cut.
CREATE FUNCTION next_staff_code() RETURNS text LANGUAGE sql AS $$
  SELECT 'ST-' || lpad(n::text, greatest(4, length(n::text)), '0') FROM nextval('staff_code_seq') AS n
$$;

ALTER TABLE staff ALTER COLUMN staff_code SET DEFAULT next_staff_code();

-- Only a maintenance window creates an in_maintenance period, and it creates nothing else.
ALTER TABLE aircraft_status_period
  ADD CONSTRAINT aircraft_status_period_origin_status_check CHECK ((origin = 'maintenance') = (status = 'in_maintenance'));

-- A maintenance window's status period must belong to the same aircraft.
-- The pair replaces the unique on status_period_id alone: a period has one aircraft, so it is still one window per period.
ALTER TABLE aircraft_status_period ADD UNIQUE (id, aircraft_id);

ALTER TABLE aircraft_maintenance
  DROP CONSTRAINT aircraft_maintenance_status_period_id_fkey,
  DROP CONSTRAINT aircraft_maintenance_status_period_id_key,
  ADD UNIQUE (status_period_id, aircraft_id),
  ADD FOREIGN KEY (status_period_id, aircraft_id) REFERENCES aircraft_status_period (id, aircraft_id);

-- Indexes for foreign keys that are joined from the parent side.
CREATE INDEX stock_transfer_line_transfer_idx ON stock_transfer_line (stock_transfer_id);
CREATE INDEX stock_batch_receipt_idx ON stock_batch (purchase_receipt_id);
CREATE INDEX aircraft_stock_batch_idx ON aircraft_stock (stock_batch_id);
CREATE INDEX stock_movement_warehouse_idx ON stock_movement (warehouse_id, occurred_at) WHERE warehouse_id IS NOT NULL;
CREATE INDEX stock_movement_aircraft_idx ON stock_movement (aircraft_id, occurred_at) WHERE aircraft_id IS NOT NULL;
CREATE INDEX stock_movement_batch_idx ON stock_movement (stock_batch_id) WHERE stock_batch_id IS NOT NULL;
CREATE INDEX stock_movement_transfer_idx ON stock_movement (stock_transfer_id) WHERE stock_transfer_id IS NOT NULL;

-- A promo use is counted once per booking, not once per quote. A quote is shared by everyone who books in its window,
-- so with the quote as the key a second booking's redeem was a no-op and max_uses could be passed.
ALTER TABLE promo_redemption
  ADD COLUMN booking_id UUID NOT NULL,
  DROP CONSTRAINT promo_redemption_fare_quote_id_key,
  ADD UNIQUE (booking_id, promo_code_id);
CREATE INDEX promo_redemption_quote_idx ON promo_redemption (fare_quote_id, promo_code_id);

-- A voided flight report or catering order is kept, so the one-per-flight rule applies to live rows only. Before, a
-- corrected report could not be submitted after the wrong one was voided.
ALTER TABLE flight_report DROP CONSTRAINT flight_report_flight_id_key;
CREATE UNIQUE INDEX flight_report_flight_uq ON flight_report (flight_id) WHERE status <> 'void';
ALTER TABLE catering_order DROP CONSTRAINT catering_order_flight_id_key;
CREATE UNIQUE INDEX catering_order_flight_uq ON catering_order (flight_id) WHERE status <> 'void';
