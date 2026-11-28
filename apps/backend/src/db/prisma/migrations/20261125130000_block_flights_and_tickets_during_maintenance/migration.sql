-- Serialize maintenance changes with new flight assignments and ticket sales.
CREATE FUNCTION lock_aircraft_for_maintenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'in_maintenance' THEN
    PERFORM 1 FROM aircraft WHERE id = NEW.aircraft_id FOR NO KEY UPDATE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER aircraft_maintenance_availability_lock
BEFORE INSERT OR UPDATE ON aircraft_status_period
FOR EACH ROW EXECUTE FUNCTION lock_aircraft_for_maintenance();

CREATE FUNCTION assert_aircraft_available_for_sale_or_schedule(
  aircraft_uuid uuid, flight_start timestamptz, flight_end timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM aircraft WHERE id = aircraft_uuid FOR SHARE;
  IF EXISTS (
    SELECT 1
    FROM aircraft_status_period p
    LEFT JOIN aircraft_maintenance m ON m.status_period_id = p.id AND m.deleted_at IS NULL
    WHERE p.aircraft_id = aircraft_uuid
      AND p.status = 'in_maintenance' AND p.deleted_at IS NULL
      AND p.start_date <= (flight_end AT TIME ZONE 'UTC')::date
      AND (p.end_date IS NULL OR p.end_date >= (flight_start AT TIME ZONE 'UTC')::date
           OR m.status IN ('planned', 'in_progress'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'aircraft_maintenance_unavailable',
      MESSAGE = 'The aircraft is unavailable because of maintenance';
  END IF;
END;
$$;

CREATE FUNCTION check_flight_maintenance_availability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('scheduled', 'delayed', 'holding', 'diverted') AND
     (TG_OP = 'INSERT' OR OLD.status = 'cancelled' OR
      (OLD.aircraft_id, OLD.scheduled_dep_at, OLD.scheduled_arr_at) IS DISTINCT FROM
      (NEW.aircraft_id, NEW.scheduled_dep_at, NEW.scheduled_arr_at)) THEN
    PERFORM assert_aircraft_available_for_sale_or_schedule(
      NEW.aircraft_id, LEAST(NEW.scheduled_dep_at, NEW.dep_at), GREATEST(NEW.scheduled_arr_at, NEW.arr_at)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER flight_maintenance_availability
BEFORE INSERT OR UPDATE OF aircraft_id, scheduled_dep_at, scheduled_arr_at, status ON flight
FOR EACH ROW EXECUTE FUNCTION check_flight_maintenance_availability();

CREATE FUNCTION check_booking_maintenance_availability() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  leg flight%ROWTYPE;
BEGIN
  SELECT * INTO leg FROM flight WHERE id = NEW.flight_id FOR SHARE;
  IF FOUND THEN
    PERFORM assert_aircraft_available_for_sale_or_schedule(
      leg.aircraft_id, LEAST(leg.scheduled_dep_at, leg.dep_at), GREATEST(leg.scheduled_arr_at, leg.arr_at)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_segment_maintenance_availability
BEFORE INSERT OR UPDATE OF flight_id ON booking_segment
FOR EACH ROW EXECUTE FUNCTION check_booking_maintenance_availability();

CREATE TRIGGER booking_coupon_maintenance_on_insert
BEFORE INSERT ON booking_coupon
FOR EACH ROW WHEN (NEW.status IN ('held', 'confirmed'))
EXECUTE FUNCTION check_booking_maintenance_availability();

CREATE TRIGGER booking_coupon_maintenance_on_update
BEFORE UPDATE OF status, flight_id ON booking_coupon
FOR EACH ROW WHEN (
  NEW.status IN ('held', 'confirmed') AND
  (OLD.status, OLD.flight_id) IS DISTINCT FROM (NEW.status, NEW.flight_id)
)
EXECUTE FUNCTION check_booking_maintenance_availability();
