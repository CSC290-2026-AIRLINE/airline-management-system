-- A maintenance period blocks flights and ticket sales only from its start date to its end date.
-- An overrun is handled by moving the window's end date, not by blocking the aircraft until the work is signed off.
CREATE OR REPLACE FUNCTION assert_aircraft_available_for_sale_or_schedule(
  aircraft_uuid uuid, flight_start timestamptz, flight_end timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM aircraft WHERE id = aircraft_uuid FOR SHARE;
  IF EXISTS (
    SELECT 1
    FROM aircraft_status_period p
    WHERE p.aircraft_id = aircraft_uuid
      AND p.status = 'in_maintenance' AND p.deleted_at IS NULL
      AND p.start_date <= (flight_end AT TIME ZONE 'UTC')::date
      AND (p.end_date IS NULL OR p.end_date >= (flight_start AT TIME ZONE 'UTC')::date)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'aircraft_maintenance_unavailable',
      MESSAGE = 'The aircraft is unavailable because of maintenance';
  END IF;
END;
$$;
