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
