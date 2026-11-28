-- LOCAL ONLY. Adds the November 2026 BI Financial report demo.
--   docker exec -i airline_postgres psql -U postgres -d airline_db -v ON_ERROR_STOP=1 < apps/backend/scripts/bi-mock-finance.sql
--
-- This seeds the monthly summary because Finance recompute currently has no revenue source.
-- Recomputing November in Pricing & Finance replaces the demo summary.

DO $$
BEGIN
  IF current_database() <> 'airline_db' THEN
    RAISE EXCEPTION 'refusing to seed demo finance data in database %', current_database();
  END IF;
END $$;

WITH demo AS (
  SELECT DATE '2026-11-01' AS month,
         14000000000.00 AS revenue_amount,
          1000000000.00 AS pass_through_amount,
           200000000.00 AS refund_amount,
          1200000000.00 AS maintenance_cost,
          1600000000.00 AS staff_cost,
           400000000.00 AS catering_cost,
          1600000000.00 AS other_cost
)
INSERT INTO finance_monthly_summary (
  month, revenue_amount, pass_through_amount, refund_amount, maintenance_cost,
  staff_cost, catering_cost, other_cost, profit_amount, computed_at
)
SELECT month, revenue_amount, pass_through_amount, refund_amount, maintenance_cost,
       staff_cost, catering_cost, other_cost,
       revenue_amount - pass_through_amount - refund_amount - maintenance_cost
         - staff_cost - catering_cost - other_cost,
       TIMESTAMPTZ '2026-11-25 00:00:00+07'
FROM demo
ON CONFLICT (month) DO NOTHING;

SELECT month::text, revenue_amount, profit_amount
FROM finance_monthly_summary
WHERE month = DATE '2026-11-01';
