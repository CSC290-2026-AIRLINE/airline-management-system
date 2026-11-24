-- Feature 3b's booking events (docs/f3-g13.md, "13 Notifications"), sent by feature 13 to the booking's customer. Feature 3b
-- publishes them on its in-process booking event bus; source_event_id is the event type, booking id, flights and time.
-- A booking cancelled because its flight was cancelled sends no booking_cancelled: flight_cancelled already told everyone.
-- Placeholders the backend fills: {{passenger_name}}, {{reference}} (the booking reference), {{flight_number}} and
-- {{service_date}} (the booking's first flight, or the flight the event is about) and {{status}} (the assistance request).
INSERT INTO notification_type (code, source_feature, name, is_mandatory) VALUES
  ('booking_confirmed', '3', 'Booking confirmed', true),
  ('booking_cancelled', '3', 'Booking cancelled', true),
  ('booking_partner_rebooked', '3', 'Rebooked on a partner airline', true),
  ('booking_seat_changed', '3', 'Seat released after an aircraft change', true),
  ('service_request_updated', '3', 'Assistance request updated', false);

INSERT INTO notification_template (type_code, channel, subject_template, body_template) VALUES
  ('booking_confirmed', 'email', 'Booking {{reference}} is confirmed',
   'Dear {{passenger_name}}, your booking {{reference}} is confirmed. Your trip starts with flight {{flight_number}} on {{service_date}}.'),
  ('booking_confirmed', 'sms', NULL, 'Flython booking {{reference}} is confirmed. First flight {{flight_number}} on {{service_date}}.'),
  ('booking_confirmed', 'push', 'Booking confirmed', 'Booking {{reference}} is confirmed.'),
  ('booking_cancelled', 'email', 'Booking {{reference}} is cancelled',
   'Dear {{passenger_name}}, your booking {{reference}} has been cancelled. Any refund due is shown on the booking page.'),
  ('booking_cancelled', 'sms', NULL, 'Flython booking {{reference}} has been cancelled.'),
  ('booking_cancelled', 'push', 'Booking cancelled', 'Booking {{reference}} has been cancelled.'),
  ('booking_partner_rebooked', 'email', 'Booking {{reference}} is rebooked on a partner airline',
   'Dear {{passenger_name}}, flight {{flight_number}} on {{service_date}} was cancelled and booking {{reference}} has been rebooked on a partner airline. Your new flight details are on the booking page.'),
  ('booking_partner_rebooked', 'sms', NULL, 'Flight {{flight_number}} on {{service_date}} was cancelled. Booking {{reference}} is rebooked on a partner airline.'),
  ('booking_partner_rebooked', 'push', 'Rebooked on a partner airline', 'Booking {{reference}} is rebooked on a partner airline.'),
  ('booking_seat_changed', 'email', 'Please choose a new seat for booking {{reference}}',
   'Dear {{passenger_name}}, the aircraft for flight {{flight_number}} on {{service_date}} has changed and your seat is no longer available. Please choose a new seat on the booking page or at check-in.'),
  ('booking_seat_changed', 'sms', NULL, 'Flight {{flight_number}} on {{service_date}}: the aircraft changed and your seat was released. Choose a new seat for {{reference}}.'),
  ('booking_seat_changed', 'push', 'Choose a new seat', 'Your seat on flight {{flight_number}} was released. Please choose a new one.'),
  ('service_request_updated', 'email', 'Assistance request update for booking {{reference}}',
   'Dear {{passenger_name}}, your special assistance request on booking {{reference}} is now: {{status}}.'),
  ('service_request_updated', 'sms', NULL, 'Flython booking {{reference}}: assistance request {{status}}.'),
  ('service_request_updated', 'push', 'Assistance request update', 'Booking {{reference}}: assistance request {{status}}.');
