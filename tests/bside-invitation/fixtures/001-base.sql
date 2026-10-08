-- Wild Hub v1. Additive, isolated namespace; never reads or mutates Duh Wild tables.
-- Apply explicitly to an approved isolated PostgreSQL database. No startup migration.
CREATE TABLE IF NOT EXISTS wh_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  verified_at timestamptz NOT NULL,
  standing text NOT NULL DEFAULT 'active' CHECK (standing IN ('active','suspended','blocked')),
  name text NOT NULL DEFAULT '',
  photo_id uuid,
  acknowledged_at timestamptz,
  acknowledgement_version text,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS wh_codes (
  email text PRIMARY KEY,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS wh_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES wh_users(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS wh_sessions_user_idx ON wh_sessions(user_id);
CREATE TABLE IF NOT EXISTS wh_media (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES wh_users(id),
  kind text NOT NULL CHECK (kind IN ('profile','public','post')),
  bytes bytea NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS wh_hubs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL UNIQUE REFERENCES wh_users(id),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  about text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  public_photo_id uuid REFERENCES wh_media(id),
  public_host_name text,
  published_consent_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (NOT published OR (public_photo_id IS NOT NULL AND published_consent_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS wh_memberships (
  hub_id uuid NOT NULL REFERENCES wh_hubs(id),
  user_id uuid NOT NULL REFERENCES wh_users(id),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  status text NOT NULL CHECK (status IN ('active','removed','left','blocked')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(hub_id,user_id)
);
CREATE INDEX IF NOT EXISTS wh_memberships_user_idx ON wh_memberships(user_id,status);
CREATE TABLE IF NOT EXISTS wh_requests (
  id uuid PRIMARY KEY,
  hub_id uuid NOT NULL REFERENCES wh_hubs(id),
  applicant_id uuid NOT NULL REFERENCES wh_users(id),
  intro text NOT NULL,
  applicant_name text NOT NULL,
  applicant_photo_id uuid NOT NULL REFERENCES wh_media(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','passed','withdrawn')),
  decided_at timestamptz,
  created_at timestamptz NOT NULL,
  UNIQUE(hub_id,applicant_id)
);
CREATE TABLE IF NOT EXISTS wh_invites (
  id uuid PRIMARY KEY,
  hub_id uuid NOT NULL REFERENCES wh_hubs(id),
  created_by uuid NOT NULL REFERENCES wh_users(id),
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES wh_users(id),
  revoked_at timestamptz,
  ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS wh_invites_hub_email_idx ON wh_invites(hub_id,email);
CREATE TABLE IF NOT EXISTS wh_posts (
  id uuid PRIMARY KEY,
  hub_id uuid NOT NULL REFERENCES wh_hubs(id),
  author_id uuid NOT NULL REFERENCES wh_users(id),
  photo_id uuid NOT NULL REFERENCES wh_media(id),
  caption text NOT NULL,
  created_at timestamptz NOT NULL,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS wh_posts_feed_idx ON wh_posts(hub_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS wh_rate_limits (
  key text NOT NULL,
  bucket bigint NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY(key,bucket)
);


-- Community access is approval-anchored and separate from billing. No automatic
-- legacy backfill: historical membership creation may precede actual approval.
-- Existing active rows without reviewed entitlement history fail closed.
ALTER TABLE wh_memberships ADD COLUMN IF NOT EXISTS access_revision uuid NOT NULL DEFAULT gen_random_uuid();
-- False marks pre-entitlement membership histories as uncertain. Only newly
-- created service memberships explicitly opt into a first activation trial.
ALTER TABLE wh_memberships ADD COLUMN IF NOT EXISTS trial_eligible boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS wh_entitlements (
  hub_id uuid NOT NULL REFERENCES wh_hubs(id),
  user_id uuid NOT NULL REFERENCES wh_users(id),
  trial_started_at timestamptz NOT NULL,
  trial_ends_at timestamptz NOT NULL,
  PRIMARY KEY(hub_id,user_id),
  CHECK (trial_ends_at = trial_started_at + interval '168 hours')
);

CREATE TABLE IF NOT EXISTS wh_messages (
  id uuid PRIMARY KEY,
  hub_id uuid NOT NULL REFERENCES wh_hubs(id),
  sender_id uuid NOT NULL REFERENCES wh_users(id),
  recipient_id uuid REFERENCES wh_users(id),
  sender_name text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  client_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(hub_id,sender_id,client_id),
  CHECK (recipient_id IS NULL OR recipient_id <> sender_id)
);
CREATE INDEX IF NOT EXISTS wh_messages_group_idx ON wh_messages(hub_id,created_at DESC,id DESC) WHERE recipient_id IS NULL;
CREATE INDEX IF NOT EXISTS wh_messages_direct_idx ON wh_messages(hub_id,sender_id,recipient_id,created_at DESC,id DESC) WHERE recipient_id IS NOT NULL;

-- Share tokens are public front-door pointers, never authentication/invitations.
-- Only the hash and internal ownership/routing references are persisted.
CREATE TABLE IF NOT EXISTS wh_shares (
  token_hash text PRIMARY KEY,
  hub_id uuid NOT NULL REFERENCES wh_hubs(id),
  user_id uuid NOT NULL REFERENCES wh_users(id),
  created_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS wh_shares_owner_idx ON wh_shares(hub_id,user_id) WHERE revoked_at IS NULL;

-- Atomic service outbox for sandbox billing reconciliation. The revision is the
-- OLD active revision being revoked, never the newly rotated inactive revision.
-- Delivery/claim/retry state belongs to the separate billing cancellation jobs.
CREATE TABLE IF NOT EXISTS wh_membership_events (
  id uuid PRIMARY KEY,
  hub_id uuid NOT NULL REFERENCES wh_hubs(id),
  user_id uuid NOT NULL REFERENCES wh_users(id),
  membership_revision uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('removed','left','blocked')),
  created_at timestamptz NOT NULL,
  UNIQUE(hub_id,user_id,membership_revision)
);
CREATE INDEX IF NOT EXISTS wh_membership_events_order_idx ON wh_membership_events(created_at,id);
