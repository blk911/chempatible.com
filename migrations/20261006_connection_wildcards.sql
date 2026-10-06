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
