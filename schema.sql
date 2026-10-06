CREATE TABLE IF NOT EXISTS email_codes (
  email text PRIMARY KEY,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY,
  session_hash text NOT NULL UNIQUE,
  name text NOT NULL,
  contact text NOT NULL,
  photo text NOT NULL,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_sessions (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS invitations (
  token_hash text PRIMARY KEY,
  sender_email text NOT NULL,
  sender_name text NOT NULL,
  sender_photo text NOT NULL,
  sender_answers jsonb NOT NULL,
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  sender_member_id uuid,
  channel text NOT NULL DEFAULT 'email',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_sender_idx ON invitations(sender_email, created_at DESC);
CREATE TABLE IF NOT EXISTS connection_state (
  invitation_hash text PRIMARY KEY REFERENCES invitations(token_hash) ON DELETE CASCADE,
  prospect_name text,
  prospect_photo text,
  prospect_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  prospect_phone text,
  prospect_email text,
  status text NOT NULL DEFAULT 'invited',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  claim_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Moderation and activity (api/_ops.mjs also creates these on first use).
CREATE TABLE IF NOT EXISTS activity (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), kind text NOT NULL, member_id uuid, connection_id text, detail jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE INDEX IF NOT EXISTS activity_at_idx ON activity(at DESC);
CREATE INDEX IF NOT EXISTS activity_member_idx ON activity(member_id, at DESC);
CREATE TABLE IF NOT EXISTS reports (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), connection_id text NOT NULL, reporter_side text NOT NULL, reporter_member_id uuid, reporter_name text, reported_member_id uuid, reported_name text, reported_contact text, reason text NOT NULL, note text, chat jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL DEFAULT 'open', reviewed_at timestamptz, UNIQUE(connection_id, reporter_side));
CREATE INDEX IF NOT EXISTS reports_reported_idx ON reports(reported_member_id);
ALTER TABLE members ADD COLUMN IF NOT EXISTS suspended_until timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS admin_notes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE connection_state ADD COLUMN IF NOT EXISTS prospect_member_id uuid;
ALTER TABLE connection_state ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE connection_state ADD COLUMN IF NOT EXISTS ended_by text;
-- Proposed additive migration. Apply only to an explicitly approved database.
-- No existing invitations, states, profiles, messages, or reports are changed.
CREATE TABLE IF NOT EXISTS connection_visibility (
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  invitation_hash text NOT NULL REFERENCES invitations(token_hash) ON DELETE CASCADE,
  frozen_at timestamptz,
  action text NOT NULL CHECK (action IN ('freeze','unfreeze','cancel','block')),
  action_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, invitation_hash),
  CHECK ((action='unfreeze' AND frozen_at IS NULL) OR (action<>'unfreeze' AND frozen_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS connection_visibility_frozen_idx ON connection_visibility(member_id, frozen_at DESC) WHERE frozen_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS connection_visibility_invitation_idx ON connection_visibility(invitation_hash);
CREATE TABLE IF NOT EXISTS member_blocks (
  blocker_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id<>blocked_id)
);
CREATE INDEX IF NOT EXISTS member_blocks_reverse_idx ON member_blocks(blocked_id, blocker_id);
-- Additive lifecycle migration. Apply only to the explicitly approved database.
-- Plan: apply columns/indexes first, verify them, then deploy the matching API/UI.
-- This does not change existing connection states, visibility, blocks, dates,
-- profiles, answers, messages, reports, or invitations. Legacy personal freezes
-- stay live until their owner explicitly freezes the interaction under new rules.
-- Rollback requires a compatible build that still enforces recipient binding and
-- Trash visibility. Do not redeploy a pre-lifecycle app after new rows are created.
ALTER TABLE connection_visibility ADD COLUMN IF NOT EXISTS trashed_at timestamptz;
ALTER TABLE connection_visibility ADD COLUMN IF NOT EXISTS restored_at timestamptz;
CREATE INDEX IF NOT EXISTS connection_visibility_trash_idx ON connection_visibility(member_id,trashed_at DESC) WHERE trashed_at IS NOT NULL;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS intended_member_id uuid REFERENCES members(id);
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS intended_email text;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS reinvite_from text REFERENCES invitations(token_hash) ON DELETE SET NULL;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS reinvite_request_hash text;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS delivery_status text CHECK(delivery_status IN ('pending','sent','uncertain','blocked'));
CREATE UNIQUE INDEX IF NOT EXISTS invitations_reinvite_request_idx ON invitations(sender_member_id,reinvite_request_hash) WHERE reinvite_request_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS invitations_reinvite_source_idx ON invitations(reinvite_from,created_at DESC) WHERE reinvite_from IS NOT NULL;
-- Additive only. Apply to isolated development first; production requires review.
-- Personal earned pieces survive any one connection. Private answers are never shared.
CREATE TABLE IF NOT EXISTS discovery_drafts (
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 module_id text NOT NULL, version text NOT NULL,
 answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(answers)='object'),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(member_id,module_id,version)
);
CREATE TABLE IF NOT EXISTS discovery_pieces (
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 module_id text NOT NULL, version text NOT NULL,
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 completed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(member_id,module_id,version)
);
CREATE TABLE IF NOT EXISTS discovery_games (
 invitation_hash text NOT NULL REFERENCES invitations(token_hash) ON DELETE CASCADE,
 module_id text NOT NULL, version text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(invitation_hash,module_id,version)
);
CREATE TABLE IF NOT EXISTS discovery_players (
 invitation_hash text NOT NULL, module_id text NOT NULL, version text NOT NULL,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, shared_at timestamptz,
 PRIMARY KEY(invitation_hash,module_id,version,member_id),
 FOREIGN KEY(invitation_hash,module_id,version) REFERENCES discovery_games(invitation_hash,module_id,version) ON DELETE CASCADE,
 CHECK(shared_at IS NULL OR completed_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS discovery_events (
 invitation_hash text NOT NULL, module_id text NOT NULL, version text NOT NULL,
 event_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(invitation_hash,module_id,version,event_key),
 FOREIGN KEY(invitation_hash,module_id,version) REFERENCES discovery_games(invitation_hash,module_id,version) ON DELETE CASCADE
);

ALTER TABLE discovery_drafts ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0 CHECK(revision>=0);
-- Additive, development-review only. No existing answers or contacts are changed.
CREATE TABLE IF NOT EXISTS member_reward_state (
 member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 completed_level integer NOT NULL DEFAULT 0 CHECK(completed_level BETWEEN 0 AND 5),
 answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(answers)='object'),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reward_phone_offers (
 invitation_hash text NOT NULL REFERENCES invitations(token_hash) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{6,14}$'),
 offered_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(invitation_hash,member_id)
);
CREATE TABLE IF NOT EXISTS reward_connection_events (
 invitation_hash text NOT NULL REFERENCES invitations(token_hash) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 event_key text NOT NULL CHECK(event_key='level-3-upgrade'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(invitation_hash,member_id,event_key)
);
-- Review-only opt-in directory. Apply explicitly to the isolated development
-- database after the reward-game migration; request handlers never run DDL.
-- No existing account is listed and no private photo is copied by this migration.
CREATE TABLE IF NOT EXISTS reward_directory_profile (
 member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 listed boolean NOT NULL DEFAULT false,
 photo text CHECK(photo IS NULL OR length(photo)<250000),
 display_name text CHECK(display_name IS NULL OR length(display_name) BETWEEN 1 AND 50),
 video bytea CHECK(video IS NULL OR octet_length(video) BETWEEN 1 AND 2097152),
 video_mime text CHECK(video_mime IS NULL OR video_mime='video/mp4'),
 duration_seconds double precision CHECK(duration_seconds IS NULL OR (duration_seconds>0 AND duration_seconds<=15)),
 video_published boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT listed OR (photo IS NOT NULL AND display_name IS NOT NULL)),
 CHECK((video IS NULL AND video_mime IS NULL AND duration_seconds IS NULL) OR (video IS NOT NULL AND video_mime IS NOT NULL AND duration_seconds IS NOT NULL)),
 CHECK(NOT video_published OR (listed AND video IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS reward_directory_listed_idx ON reward_directory_profile(member_id) WHERE listed;
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
-- Additive only. Apply explicitly to the approved database before deploying the
-- wildcard endpoint. Request handlers never run DDL. Existing messages, answers,
-- contact-sharing consent, connections, and reward levels are not changed.
-- Keep this ledger on code rollback so spending and question deduplication are
-- retained if the feature returns. Do not reset or delete existing user data.
CREATE TABLE IF NOT EXISTS connection_wildcard_asks (
 invitation_hash text NOT NULL REFERENCES connection_state(invitation_hash) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 request_id text NOT NULL CHECK(request_id ~ '^[A-Za-z0-9_-]{8,128}$'),
 question_id text NOT NULL CHECK(question_id ~ '^wc-[a-z]+-[1-9][0-9]*$'),
 slot smallint NOT NULL CHECK(slot BETWEEN 1 AND 3),
 message jsonb NOT NULL CHECK(jsonb_typeof(message)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(invitation_hash,member_id,request_id),
 CONSTRAINT connection_wildcard_question_once UNIQUE(invitation_hash,question_id),
 CONSTRAINT connection_wildcard_member_slot UNIQUE(invitation_hash,member_id,slot)
);
-- Read-only verification (constraints must include both named UNIQUEs, the
-- primary key, the slot CHECK, and two cascading foreign keys):
-- SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='connection_wildcard_asks'::regclass ORDER BY conname;
-- These three checks must return no rows:
-- SELECT invitation_hash,member_id FROM connection_wildcard_asks
-- GROUP BY invitation_hash,member_id HAVING count(*)>3;
-- SELECT invitation_hash,question_id FROM connection_wildcard_asks
-- GROUP BY invitation_hash,question_id HAVING count(*)>1;
-- SELECT w.invitation_hash,w.question_id FROM connection_wildcard_asks w
-- JOIN connection_state c USING(invitation_hash)
-- WHERE (SELECT count(*) FROM jsonb_array_elements(c.messages) m
--        WHERE m->>'id'=w.message->>'id')<>1;
