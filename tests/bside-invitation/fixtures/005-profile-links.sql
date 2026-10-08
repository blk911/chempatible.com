-- Apply explicitly to the approved isolated Wild Hub database after 001..004.
-- Additive only: no new tables, data backfill, role/grant changes, marker changes,
-- external calls or startup migration. Existing rows receive an empty object.
BEGIN;
ALTER TABLE public.wh_users
  ADD COLUMN IF NOT EXISTS public_links jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $column_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_attrdef d
      ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.wh_users'::regclass AND a.attname='public_links'
      AND NOT a.attisdropped AND a.atttypid='jsonb'::regtype AND a.attnotnull
      AND pg_get_expr(d.adbin,d.adrelid)='''{}''::jsonb'
  ) THEN
    RAISE EXCEPTION 'Unexpected existing wh_users.public_links column definition';
  END IF;
END $column_check$;

-- The reference is removed before COMMIT. Comparing parsed expressions avoids
-- trusting a pre-existing constraint with the correct name but the wrong rules.
ALTER TABLE public.wh_users ADD CONSTRAINT wh_users_public_links_005_review CHECK (
      jsonb_typeof(public_links)='object'
      AND (public_links - ARRAY['instagram','tiktok','youtube','website'])='{}'::jsonb
      AND octet_length(public_links::text)<=32768
      AND (NOT public_links ? 'instagram' OR (
        jsonb_typeof(public_links->'instagram')='string'
        AND length(public_links->>'instagram') BETWEEN 1 AND 2048
        AND (public_links->>'instagram') ~ '^https?://'
        AND (public_links->>'instagram') !~ '[[:cntrl:]]'))
      AND (NOT public_links ? 'tiktok' OR (
        jsonb_typeof(public_links->'tiktok')='string'
        AND length(public_links->>'tiktok') BETWEEN 1 AND 2048
        AND (public_links->>'tiktok') ~ '^https?://'
        AND (public_links->>'tiktok') !~ '[[:cntrl:]]'))
      AND (NOT public_links ? 'youtube' OR (
        jsonb_typeof(public_links->'youtube')='string'
        AND length(public_links->>'youtube') BETWEEN 1 AND 2048
        AND (public_links->>'youtube') ~ '^https?://'
        AND (public_links->>'youtube') !~ '[[:cntrl:]]'))
      AND (NOT public_links ? 'website' OR (
        jsonb_typeof(public_links->'website')='string'
        AND length(public_links->>'website') BETWEEN 1 AND 2048
        AND (public_links->>'website') ~ '^https?://'
        AND (public_links->>'website') !~ '[[:cntrl:]]'))
) NOT VALID;
DO $constraint_check$
DECLARE expected text; actual text; validated boolean;
BEGIN
  SELECT pg_get_expr(conbin,conrelid) INTO expected FROM pg_constraint
    WHERE conrelid='public.wh_users'::regclass AND conname='wh_users_public_links_005_review';
  SELECT pg_get_expr(conbin,conrelid),convalidated INTO actual,validated FROM pg_constraint
    WHERE conrelid='public.wh_users'::regclass AND conname='wh_users_public_links_valid' AND contype='c';
  IF FOUND THEN
    IF actual IS DISTINCT FROM expected OR validated IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Unexpected existing public-links constraint definition or validation state';
    END IF;
    ALTER TABLE public.wh_users DROP CONSTRAINT wh_users_public_links_005_review;
  ELSE
    ALTER TABLE public.wh_users RENAME CONSTRAINT wh_users_public_links_005_review TO wh_users_public_links_valid;
    ALTER TABLE public.wh_users VALIDATE CONSTRAINT wh_users_public_links_valid;
  END IF;
END $constraint_check$;
COMMIT;
