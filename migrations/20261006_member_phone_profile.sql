-- Additive only. Apply explicitly to an approved database before deploying the
-- matching rewards API. Request handlers never run DDL or backfill this table.
-- This is a private member-confirmed phone profile, NOT SMS ownership proof.
-- Saving here never offers/shares a phone, changes a reward, lists a member,
-- opens chat, reveals answers, or changes a connection or its existing consent.
-- Legacy contact numbers are read only for their own member's prefill; they
-- are not copied or marked confirmed until that member explicitly confirms.
-- Keep this table on code rollback. Do not delete or reset member data.
CREATE TABLE IF NOT EXISTS member_phone_profile (
 member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{6,14}$'),
 confirmed_at timestamptz NOT NULL DEFAULT now(),
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 2147483647),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Read-only verification: one primary key, one cascading member foreign key,
-- and the phone/revision CHECK constraints must be present.
-- SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='member_phone_profile'::regclass ORDER BY conname;
-- SELECT column_name,data_type,is_nullable,column_default
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='member_phone_profile'
-- ORDER BY ordinal_position;
-- This check must return no rows. Do not select actual phone numbers for logs.
-- SELECT member_id FROM member_phone_profile
-- WHERE phone !~ '^\+[1-9][0-9]{6,14}$' OR confirmed_at IS NULL
-- OR revision NOT BETWEEN 1 AND 2147483647;
