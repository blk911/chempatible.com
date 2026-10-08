-- Durable request/approval notifications. Apply after 001-base; no automatic
-- hosted startup migration. Recipient addresses and private intros/photos are
-- not copied into the outbox. Logical dedupe keys survive retries/restarts.
CREATE TABLE IF NOT EXISTS wh_notifications (
  id uuid PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('request','approval')),
  hub_id uuid NOT NULL REFERENCES wh_hubs(id),
  request_id uuid NOT NULL,
  recipient_id uuid NOT NULL REFERENCES wh_users(id),
  membership_revision uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retry','accepted','suppressed','uncertain','failed')),
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('simulated','provider','unknown')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL,
  lease_id uuid,
  lease_until timestamptz,
  accepted_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK ((kind='request' AND membership_revision IS NULL) OR (kind='approval' AND membership_revision IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS wh_notifications_due_idx ON wh_notifications(next_attempt_at,created_at,id) WHERE status IN ('pending','retry','processing');
CREATE INDEX IF NOT EXISTS wh_notifications_request_idx ON wh_notifications(request_id,created_at DESC,id DESC);
