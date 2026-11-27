-- LOCAL ONLY. Adds maintenance and grounding periods to aircraft, so the "Days out of service" table on the Aircraft use
-- page has rows for October 2026 (the page's default month) and for other months.
--
--   docker exec -i airline_postgres psql -U postgres -d airline_db -v ON_ERROR_STOP=1 < apps/backend/scripts/bi-mock-downtime.sql
--
-- Feature 9 owns aircraft_status_period. The BI refresh copies these rows into bi_aircraft_downtime. It runs in one
-- transaction and refuses to run twice.

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'airline_db' THEN
    RAISE EXCEPTION 'refusing to run: database is %, expected airline_db', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM aircraft_status_period WHERE reason LIKE 'Mock %') THEN
    RAISE EXCEPTION 'these downtime periods are already loaded; not loading them twice';
  END IF;
END $$;

-- Each row names the aircraft by tail number, which keeps this script independent of the ids.
WITH periods (tail, status, reason, start_date, end_date) AS (
  VALUES
    ('HS-F6A', 'in_maintenance', 'Mock C-check (maintenance)', date '2026-10-06', date '2026-10-12'),
    ('HS-XA1', 'in_maintenance', 'Mock A-check (maintenance)', date '2026-10-21', date '2026-10-21'),
    ('HS-XT1', 'grounded', 'Mock Grounded: bird strike', date '2026-10-14', date '2026-10-15'),
    ('HS-XA2', 'in_maintenance', 'Mock A-check (maintenance)', date '2026-10-02', date '2026-10-03'),
    ('HS-F6B', 'in_maintenance', 'Mock Engine inspection', date '2026-09-18', date '2026-09-20'),
    ('HS-XA3', 'grounded', 'Mock Grounded: hydraulic leak', date '2026-11-03', date '2026-11-04'),
    ('HS-XA1', 'in_maintenance', 'Mock C-check (maintenance)', date '2026-08-10', date '2026-08-16')
)
INSERT INTO aircraft_status_period (aircraft_id, status, origin, reason, start_date, end_date, created_by)
SELECT a.id, p.status, 'manual', p.reason, p.start_date, p.end_date, (SELECT id FROM staff LIMIT 1)
FROM periods p
JOIN aircraft a ON a.tail_number = p.tail AND a.deleted_at IS NULL;

COMMIT;

SELECT 'downtime periods' AS table_name, count(*) FROM aircraft_status_period WHERE reason LIKE 'Mock %';
