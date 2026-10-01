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
