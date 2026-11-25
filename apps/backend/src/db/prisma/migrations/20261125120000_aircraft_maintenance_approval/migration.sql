ALTER TABLE aircraft_maintenance
  ALTER COLUMN status_period_id DROP NOT NULL,
  DROP CONSTRAINT aircraft_maintenance_status_check,
  ADD CONSTRAINT aircraft_maintenance_status_check
    CHECK (status IN ('pending_approval', 'rejected', 'planned', 'in_progress', 'completed', 'cancelled')),
  ADD CONSTRAINT aircraft_maintenance_status_period_check
    CHECK ((status_period_id IS NULL) = (status IN ('pending_approval', 'rejected')));
