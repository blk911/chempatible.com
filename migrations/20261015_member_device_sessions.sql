-- Additive device sessions. Existing member/invitation/private content is retained.
-- Run once before the new app is released; reruns do not renew/revive sessions.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE members IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS member_sessions (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK (expires_at <= created_at + interval '180 days')
);
CREATE INDEX IF NOT EXISTS member_sessions_member_idx ON member_sessions(member_id);
ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS challenge_id uuid;
ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
ALTER TABLE email_sessions ADD COLUMN IF NOT EXISTS member_session_hash text;
CREATE INDEX IF NOT EXISTS email_sessions_member_session_idx ON email_sessions(member_session_hash);

-- Legacy cookies keep their original browser expiry. A conservative server cap
-- uses the last existing update timestamp, never sliding on page loads or reruns.
INSERT INTO member_sessions(token_hash,member_id,created_at,expires_at)
 SELECT session_hash,id,least(updated_at,now()),least(updated_at,now())+interval '180 days'
 FROM members WHERE session_hash ~ '^[a-f0-9]{64}$'
 ON CONFLICT(token_hash) DO NOTHING;

-- Capture old-build registrations/logins during rollout. New logins insert
-- independent rows directly and do not update the compatibility column.
CREATE OR REPLACE FUNCTION duhwild_capture_legacy_session() RETURNS trigger
 LANGUAGE plpgsql AS $$
 BEGIN
  IF TG_OP='UPDATE' AND OLD.session_hash IS DISTINCT FROM NEW.session_hash THEN
   UPDATE public.member_sessions SET revoked_at=coalesce(revoked_at,now()) WHERE token_hash=OLD.session_hash;
  END IF;
  INSERT INTO public.member_sessions(token_hash,member_id,expires_at)
   VALUES(NEW.session_hash,NEW.id,now()+interval '180 days') ON CONFLICT(token_hash) DO NOTHING;
  RETURN NEW;
 END $$;
DROP TRIGGER IF EXISTS duhwild_legacy_session ON members;
CREATE TRIGGER duhwild_legacy_session AFTER INSERT OR UPDATE OF session_hash ON members
 FOR EACH ROW EXECUTE FUNCTION duhwild_capture_legacy_session();

CREATE OR REPLACE FUNCTION duhwild_session_member(session_hash text) RETURNS uuid
 LANGUAGE sql STABLE STRICT AS $$
  SELECT member_id FROM public.member_sessions
  WHERE token_hash=session_hash AND revoked_at IS NULL AND expires_at>statement_timestamp()
 $$;
COMMIT;
