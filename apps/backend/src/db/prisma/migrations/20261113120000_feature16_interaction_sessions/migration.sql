-- Feature 16 (IoT, G14's WALL-E robot), from G14's diagram of interaction_session and session_detail and their IoT
-- documentation. A session is one conversation with the robot, and each session_detail row is one question and its
-- answer. New tables only. No foreign keys to other features' tables.
-- Changed from the diagram to match the rest of the schema:
--   id is a UUID, like every other table's id, not an int.
--   start_Time and end_Time are started_at and ended_at, TIMESTAMPTZ. Postgres folds an unquoted start_Time to
--   start_time anyway.
--   order is seq, because ORDER is a reserved word. fare_quote_line numbers its lines with seq too.
-- There is one robot, so a session does not record which device ran it.

-- ended_at stays NULL while the session is open.
CREATE TABLE interaction_session (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at   TIMESTAMPTZ,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- seq numbers the questions 1, 2, 3 ... within the session. answer is NULL until there is one.
CREATE TABLE session_detail (
  session_id UUID NOT NULL REFERENCES interaction_session (id),
  seq        INTEGER NOT NULL CHECK (seq > 0),
  question   TEXT NOT NULL,
  answer     TEXT,
  PRIMARY KEY (session_id, seq)
);
