-- Feature 4: a promo use is counted once per booking, not once per quote (docs/f4-g12.md, "Promo redemption").
-- Quotes are shared by every caller until they expire, so two bookings can redeem the same quote, and a booking with
-- several legs has several quotes but spends one use. A refunded or failed booking releases its use.
--
--   redeem:  INSERT ... ON CONFLICT (promo_code_id, booking_ref) DO NOTHING; then, only if a row was inserted,
--            UPDATE promo_code SET used_count = used_count + 1 WHERE id = $1 AND (max_uses IS NULL OR used_count < max_uses)
--   release: status = 'released', released_at = <simulated now>, used_count = used_count - 1

ALTER TABLE promo_redemption
  ADD COLUMN booking_ref TEXT,
  ADD COLUMN status      TEXT NOT NULL DEFAULT 'redeemed',
  ADD COLUMN released_at TIMESTAMPTZ;

-- Uses counted before this migration came from the old redeem-by-quote route and have no booking. Each keeps one use,
-- keyed by its quote, so nothing is counted twice and nothing is lost.
UPDATE promo_redemption SET booking_ref = 'quote:' || fare_quote_id::text WHERE booking_ref IS NULL;

ALTER TABLE promo_redemption ALTER COLUMN booking_ref SET NOT NULL;

ALTER TABLE promo_redemption ADD CONSTRAINT promo_redemption_status_ck CHECK (status IN ('redeemed', 'released'));
ALTER TABLE promo_redemption ADD CONSTRAINT promo_redemption_released_ck CHECK ((status = 'released') = (released_at IS NOT NULL));

-- One row per quote no longer holds: the same quote can back more than one booking.
ALTER TABLE promo_redemption DROP CONSTRAINT promo_redemption_fare_quote_id_key;
CREATE UNIQUE INDEX promo_redemption_booking_uq ON promo_redemption (promo_code_id, booking_ref);
