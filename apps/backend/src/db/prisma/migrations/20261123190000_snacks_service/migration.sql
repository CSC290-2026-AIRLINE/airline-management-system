ALTER TABLE cabin_setting ADD COLUMN snacks_complimentary BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE cabin_setting ADD CONSTRAINT cabin_setting_snacks_complimentary_check
  CHECK (NOT snacks_complimentary OR snacks_enabled IS TRUE);
