-- LOCAL ONLY. Adds scheduled payments due after the simulation date (22 November 2026), so the Financial report's
-- "Upcoming payments" list has rows. Feature 4 reads these from payment_schedule.
--
--   docker exec -i airline_postgres psql -U postgres -d airline_db -v ON_ERROR_STOP=1 < apps/backend/scripts/bi-mock-upcoming-payments.sql
--
-- Staff and catering are monthly, maintenance has three dated jobs, and other costs have two. It runs in one
-- transaction and refuses to run twice.

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'airline_db' THEN
    RAISE EXCEPTION 'refusing to run: database is %, expected airline_db', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM payment_schedule WHERE payee IN ('Payroll', 'Catering Co', 'MRO Services', 'Parts Supplier', 'Airport Authority', 'Insurance Broker')) THEN
    RAISE EXCEPTION 'these upcoming payments are already loaded; not loading them twice';
  END IF;
END $$;

-- Monthly staff payroll: the 1st of each month, Dec 2026 to Mar 2027.
INSERT INTO payment_schedule (category, payee, description, amount, due_date, created_by)
SELECT 'staff', 'Payroll', 'Monthly crew and office payroll', 1850000, d::date, (SELECT id FROM staff LIMIT 1)
FROM generate_series('2026-12-01'::date, '2027-03-01'::date, interval '1 month') AS d;

-- Monthly catering supply: the 5th of each month.
INSERT INTO payment_schedule (category, payee, description, amount, due_date, created_by)
SELECT 'catering', 'Catering Co', 'Onboard catering supply', 560000, d::date, (SELECT id FROM staff LIMIT 1)
FROM generate_series('2026-12-05'::date, '2027-03-05'::date, interval '1 month') AS d;

-- Maintenance jobs.
INSERT INTO payment_schedule (category, payee, description, amount, due_date, created_by)
VALUES
  ('maintenance', 'MRO Services', 'A-check, tail 1', 2400000, '2026-12-10', (SELECT id FROM staff LIMIT 1)),
  ('maintenance', 'MRO Services', 'Engine borescope inspection', 780000, '2027-01-15', (SELECT id FROM staff LIMIT 1)),
  ('maintenance', 'Parts Supplier', 'Landing gear parts order', 1150000, '2027-02-20', (SELECT id FROM staff LIMIT 1));

-- Other costs.
INSERT INTO payment_schedule (category, payee, description, amount, due_date, created_by)
VALUES
  ('other', 'Airport Authority', 'Quarterly airport charges', 920000, '2026-12-31', (SELECT id FROM staff LIMIT 1)),
  ('other', 'Insurance Broker', 'Annual fleet insurance premium', 3100000, '2027-03-31', (SELECT id FROM staff LIMIT 1));

COMMIT;

SELECT 'upcoming payments' AS table_name, count(*) FROM payment_schedule WHERE payee IN ('Payroll', 'Catering Co', 'MRO Services', 'Parts Supplier', 'Airport Authority', 'Insurance Broker');
