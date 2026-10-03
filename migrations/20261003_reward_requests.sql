-- Isolated development only; applied explicitly, never from request handlers.
-- Pending previews expose profile snapshots only. The sender's first five
-- answers are stored privately to preserve exactly what was offered; they are
-- copied to a mutual connection only when the target explicitly accepts.
CREATE TABLE IF NOT EXISTS reward_discovery_requests (
 id uuid PRIMARY KEY,
 sender_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 target_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','passed','cancelled')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 created_at timestamptz NOT NULL DEFAULT now(),
 invitation_hash text REFERENCES invitations(token_hash) ON DELETE SET NULL,
 sender_first_five jsonb NOT NULL CHECK(jsonb_typeof(sender_first_five)='array' AND jsonb_array_length(sender_first_five)=5 AND '[0,1,2]'::jsonb @> sender_first_five),
 sender_name text NOT NULL CHECK(length(sender_name) BETWEEN 1 AND 50),
 sender_photo text NOT NULL CHECK(length(sender_photo)<250000),
 target_name text NOT NULL CHECK(length(target_name) BETWEEN 1 AND 50),
 target_photo text NOT NULL CHECK(length(target_photo)<250000),
 CHECK(sender_id<>target_id),
 CHECK(status='accepted' OR invitation_hash IS NULL),
 UNIQUE(sender_id,target_id)
);
-- A pass, cancellation or expiry is not a license to send repeated requests.
-- Also prevents simultaneous opposite-direction requests creating two pairs.
CREATE UNIQUE INDEX IF NOT EXISTS reward_discovery_requests_pair_idx ON reward_discovery_requests(least(sender_id,target_id),greatest(sender_id,target_id));
CREATE INDEX IF NOT EXISTS reward_discovery_requests_incoming_idx ON reward_discovery_requests(target_id,created_at DESC) WHERE status='pending';
CREATE INDEX IF NOT EXISTS reward_discovery_requests_outgoing_idx ON reward_discovery_requests(sender_id,created_at DESC) WHERE status='pending';
