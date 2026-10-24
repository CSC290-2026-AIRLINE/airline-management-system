-- Feature 7 (Customer and Passenger Profiles) - screening brought up to the Iteration-03 doc.
-- screening_check keeps a snapshot of both identities it compared, so the review screen shows what matched even after the
-- passenger or the watchlist entry is edited. screening_review allows corrections: a new review with the next revision.
-- The departure time is no longer copied; the Screening Queue reads it from feature 2's flight, so delays show.
-- watchlist_entry gets gender, so the review screen can compare it with the passenger's.
-- Part 5 of schema.sql shows the result.

-- watchlist_entry -------------------------------------------------------------------------------------------------------

-- Shown on the review screen next to the passenger's gender. Matching does not use it.
ALTER TABLE watchlist_entry ADD COLUMN gender TEXT CHECK (gender IN ('M', 'F', 'X'));

-- screening_check -------------------------------------------------------------------------------------------------------

-- entry_change: the background job re-screens when a watchlist entry is edited or reactivated.
ALTER TABLE screening_check DROP CONSTRAINT screening_check_trigger_point_check,
  ADD CONSTRAINT screening_check_trigger_point_check
    CHECK (trigger_point IN ('booking', 'check_in', 'new_entry', 'entry_change', 'identity_change'));

ALTER TABLE screening_check
  ADD COLUMN name_similarity          REAL CHECK (name_similarity BETWEEN 0 AND 1),
  ADD COLUMN snap_first_name          TEXT,
  ADD COLUMN snap_last_name           TEXT,
  ADD COLUMN snap_date_of_birth       DATE,
  ADD COLUMN snap_gender              TEXT CHECK (snap_gender IN ('M', 'F', 'X')),
  ADD COLUMN snap_nationality         TEXT,
  ADD COLUMN snap_passport            TEXT,
  ADD COLUMN snap_entry_first_name    TEXT,
  ADD COLUMN snap_entry_last_name     TEXT,
  ADD COLUMN snap_entry_date_of_birth DATE,
  ADD COLUMN snap_entry_gender        TEXT CHECK (snap_entry_gender IN ('M', 'F', 'X')),
  ADD COLUMN snap_entry_nationality   TEXT,
  ADD COLUMN snap_entry_passport      TEXT;

-- Rows written before this migration never stored what was compared, so they get today's values, the closest there is.
UPDATE screening_check c
SET snap_first_name    = p.first_name,
    snap_last_name     = p.last_name,
    snap_date_of_birth = p.date_of_birth,
    snap_gender        = p.gender,
    snap_nationality   = p.nationality,
    snap_passport      = p.passport_number
FROM passenger p
WHERE p.id = c.passenger_id;

UPDATE screening_check c
SET snap_entry_first_name    = w.first_name,
    snap_entry_last_name     = w.last_name,
    snap_entry_date_of_birth = w.date_of_birth,
    snap_entry_gender        = w.gender,
    snap_entry_nationality   = w.nationality,
    snap_entry_passport      = w.passport_number,
    name_similarity          = greatest(
      similarity(name_key(c.snap_first_name, c.snap_last_name), name_key(w.first_name, w.last_name)),
      similarity(name_key(c.snap_last_name, c.snap_first_name), name_key(w.first_name, w.last_name)))
FROM watchlist_entry w
WHERE w.id = c.watchlist_entry_id;

ALTER TABLE screening_check
  ALTER COLUMN snap_first_name SET NOT NULL,
  ALTER COLUMN snap_last_name SET NOT NULL,
  ADD CONSTRAINT screening_check_check CHECK (CASE WHEN watchlist_entry_id IS NULL
    THEN num_nonnulls(name_similarity, snap_entry_first_name, snap_entry_last_name, snap_entry_date_of_birth,
                      snap_entry_gender, snap_entry_nationality, snap_entry_passport) = 0
    ELSE num_nonnulls(name_similarity, snap_entry_first_name, snap_entry_last_name) = 3
  END);

-- entry_change joins identity_change as a trigger point that can repeat for the same hit.
DROP INDEX screening_check_once_uq;
CREATE UNIQUE INDEX screening_check_once_uq
  ON screening_check (passenger_id, flight_id, watchlist_entry_id, trigger_point)
  WHERE watchlist_entry_id IS NOT NULL AND trigger_point IN ('booking', 'check_in', 'new_entry');

DROP INDEX screening_check_queue_idx;
ALTER TABLE screening_check DROP COLUMN flight_dep_at;
CREATE INDEX screening_check_open_idx ON screening_check (flight_id) WHERE outcome IN ('flagged', 'held');

-- screening_review ------------------------------------------------------------------------------------------------------

-- Existing reviews are the first for their check. The default only fills them; the backend always sets revision.
ALTER TABLE screening_review DROP CONSTRAINT screening_review_screening_check_id_key,
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  ADD CONSTRAINT screening_review_screening_check_id_revision_key UNIQUE (screening_check_id, revision);

ALTER TABLE screening_review ALTER COLUMN revision DROP DEFAULT;
