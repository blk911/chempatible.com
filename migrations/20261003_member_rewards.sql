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
