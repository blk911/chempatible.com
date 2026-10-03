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
