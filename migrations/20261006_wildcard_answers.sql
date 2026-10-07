-- Additive only. Apply explicitly to the approved database after the wildcard
-- ask ledger, before deploying the two-sided card API. No request-time DDL.
-- Each new ask atomically records its original pair here with a pending reply.
-- The recipient alone may fill the reply once. Existing asks and chat messages
-- are never rewritten or inferred to be answers. Historical asks without an
-- original-pair snapshot remain in chat and still count toward the ask quota;
-- do not backfill recipients from mutable current connection membership.
-- Keep both ledgers on code rollback. Never reset or delete user data.
CREATE TABLE IF NOT EXISTS connection_wildcard_answers (
 invitation_hash text NOT NULL,
 question_id text NOT NULL,
 sender_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 prospect_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 request_id text CHECK(request_id IS NULL OR request_id ~ '^[A-Za-z0-9_-]{8,128}$'),
 message jsonb CHECK(message IS NULL OR (jsonb_typeof(message)='object' AND message ? 'text' AND jsonb_typeof(message->'text')='string' AND length(message->>'text') BETWEEN 1 AND 1000)),
 created_at timestamptz NOT NULL DEFAULT now(),
 answered_at timestamptz,
 PRIMARY KEY(invitation_hash,question_id),
 FOREIGN KEY(invitation_hash,question_id) REFERENCES connection_wildcard_asks(invitation_hash,question_id) ON DELETE CASCADE,
 CONSTRAINT connection_wildcard_answer_request_once UNIQUE(invitation_hash,member_id,request_id),
 CHECK(sender_member_id<>prospect_member_id),
 CHECK(member_id IN(sender_member_id,prospect_member_id)),
 CHECK((request_id IS NULL AND message IS NULL AND answered_at IS NULL) OR (request_id IS NOT NULL AND message IS NOT NULL AND answered_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS connection_wildcard_answers_pending_idx ON connection_wildcard_answers(member_id,invitation_hash) WHERE answered_at IS NULL;
-- Read-only checks must return no rows; avoid selecting private message text.
-- SELECT invitation_hash,question_id FROM connection_wildcard_answers a
-- JOIN connection_wildcard_asks w USING(invitation_hash,question_id)
-- WHERE a.member_id=w.member_id OR w.member_id NOT IN(a.sender_member_id,a.prospect_member_id);
-- SELECT a.invitation_hash,a.question_id FROM connection_wildcard_answers a
-- JOIN connection_state c USING(invitation_hash) WHERE a.message IS NOT NULL
-- AND (SELECT count(*) FROM jsonb_array_elements(c.messages) m
--      WHERE m->>'id'=a.message->>'id')<>1;
