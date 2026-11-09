-- A user asked to cancel this scan. Its own column rather than a key in
-- scans.summary: the progress writers read-modify-write the whole summary every
-- ~400ms, so a flag stored there is lost whenever it lands between one of their
-- reads and writes, and the cancellation is silently ignored.
ALTER TABLE scans ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;
