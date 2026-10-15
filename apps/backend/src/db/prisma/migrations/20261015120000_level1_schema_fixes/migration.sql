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
-- BEGIN ATOMIC binds staff_code_seq when the function is created, so the caller's search_path cannot pick another one.
CREATE FUNCTION next_staff_code() RETURNS text LANGUAGE sql
BEGIN ATOMIC
  SELECT 'ST-' || lpad(n::text, greatest(4, length(n::text)), '0') FROM nextval('staff_code_seq') AS n;
END;

ALTER TABLE staff ALTER COLUMN staff_code SET DEFAULT next_staff_code();

-- Only a maintenance window creates an in_maintenance period, and it creates nothing else.
ALTER TABLE aircraft_status_period
  ADD CONSTRAINT aircraft_status_period_origin_status_check CHECK ((origin = 'maintenance') = (status = 'in_maintenance'));

-- A maintenance window's status period must belong to the same aircraft and be a maintenance period. period_origin is
-- pinned to 'maintenance' and is part of the key, like role_screen.screen_kind. The unique replaces the one on
-- status_period_id alone: a period has one aircraft and one origin, so it is still one window per period.
ALTER TABLE aircraft_status_period ADD UNIQUE (id, aircraft_id, origin);

ALTER TABLE aircraft_maintenance
  ADD COLUMN period_origin TEXT NOT NULL DEFAULT 'maintenance' CHECK (period_origin = 'maintenance'),
  DROP CONSTRAINT aircraft_maintenance_status_period_id_fkey,
  DROP CONSTRAINT aircraft_maintenance_status_period_id_key,
  ADD CONSTRAINT aircraft_maintenance_period_uq UNIQUE (status_period_id, aircraft_id, period_origin),
  ADD CONSTRAINT aircraft_maintenance_period_fk FOREIGN KEY (status_period_id, aircraft_id, period_origin)
    REFERENCES aircraft_status_period (id, aircraft_id, origin);

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

-- A mistaken screening decision is corrected by a new check, but screening_check_once_uq refused a second check for the
-- same passenger, flight, entry and trigger point. A staff re-check gets its own trigger point, outside that rule.
ALTER TABLE screening_check
  DROP CONSTRAINT screening_check_trigger_point_check,
  ADD CONSTRAINT screening_check_trigger_point_check
    CHECK (trigger_point IN ('booking', 'check_in', 'new_entry', 'identity_change', 'manual'));
DROP INDEX screening_check_once_uq;
CREATE UNIQUE INDEX screening_check_once_uq
  ON screening_check (passenger_id, flight_id, watchlist_entry_id, trigger_point)
  WHERE watchlist_entry_id IS NOT NULL AND trigger_point NOT IN ('identity_change', 'manual');

-- Nothing kept updated_at current: no trigger and no @updatedAt, so every row kept its creation time. A trigger also covers
-- raw SQL, such as the promo used_count increment.
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER role_updated_at BEFORE UPDATE ON role FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_updated_at BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER staff_updated_at BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER disruption_reason_updated_at BEFORE UPDATE ON disruption_reason FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER partner_airline_updated_at BEFORE UPDATE ON partner_airline FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER airport_updated_at BEFORE UPDATE ON airport FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER airport_fee_updated_at BEFORE UPDATE ON airport_fee FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER route_updated_at BEFORE UPDATE ON route FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER flight_pattern_updated_at BEFORE UPDATE ON flight_pattern FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER flight_updated_at BEFORE UPDATE ON flight FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER airport_congestion_updated_at BEFORE UPDATE ON airport_congestion FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER schedule_conflict_updated_at BEFORE UPDATE ON schedule_conflict FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER flight_setting_updated_at BEFORE UPDATE ON flight_setting FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER aircraft_type_updated_at BEFORE UPDATE ON aircraft_type FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER aircraft_updated_at BEFORE UPDATE ON aircraft FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER aircraft_status_period_updated_at BEFORE UPDATE ON aircraft_status_period FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER aircraft_maintenance_updated_at BEFORE UPDATE ON aircraft_maintenance FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER fleet_setting_updated_at BEFORE UPDATE ON fleet_setting FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER fare_class_updated_at BEFORE UPDATE ON fare_class FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER base_fare_updated_at BEFORE UPDATE ON base_fare FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER pricing_rule_updated_at BEFORE UPDATE ON pricing_rule FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER seat_fee_updated_at BEFORE UPDATE ON seat_fee FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER overweight_baggage_rate_updated_at BEFORE UPDATE ON overweight_baggage_rate FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tax_fee_updated_at BEFORE UPDATE ON tax_fee FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER currency_rate_updated_at BEFORE UPDATE ON currency_rate FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER promo_code_updated_at BEFORE UPDATE ON promo_code FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER pricing_setting_updated_at BEFORE UPDATE ON pricing_setting FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payment_schedule_updated_at BEFORE UPDATE ON payment_schedule FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER expense_updated_at BEFORE UPDATE ON expense FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER passenger_updated_at BEFORE UPDATE ON passenger FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customer_updated_at BEFORE UPDATE ON customer FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customer_passenger_updated_at BEFORE UPDATE ON customer_passenger FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER watchlist_entry_updated_at BEFORE UPDATE ON watchlist_entry FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER screen_updated_at BEFORE UPDATE ON screen FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER product_updated_at BEFORE UPDATE ON product FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER product_offering_updated_at BEFORE UPDATE ON product_offering FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER cabin_setting_updated_at BEFORE UPDATE ON cabin_setting FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER catering_setting_updated_at BEFORE UPDATE ON catering_setting FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER product_order_updated_at BEFORE UPDATE ON product_order FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER warehouse_updated_at BEFORE UPDATE ON warehouse FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER warehouse_stock_updated_at BEFORE UPDATE ON warehouse_stock FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER catering_order_updated_at BEFORE UPDATE ON catering_order FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER aircraft_stock_updated_at BEFORE UPDATE ON aircraft_stock FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Date ranges that could run backwards, unlike every other range in the schema.
ALTER TABLE airport_fee
  ADD CONSTRAINT airport_fee_effective_range_check CHECK (effective_to IS NULL OR effective_to >= effective_from);
ALTER TABLE aircraft
  ADD CONSTRAINT aircraft_retired_on_check CHECK (retired_on IS NULL OR retired_on >= entry_into_service_date);
ALTER TABLE aircraft_maintenance
  ADD CONSTRAINT aircraft_maintenance_actual_end_check CHECK (actual_end_date IS NULL OR actual_end_date >= planned_start_date);

-- stock_movement_order_once_uq skips rows with no order, so a reserve or release without one could be recorded twice.
ALTER TABLE stock_movement
  ADD CONSTRAINT stock_movement_order_check CHECK (type NOT IN ('reserve', 'release') OR product_order_id IS NOT NULL);
