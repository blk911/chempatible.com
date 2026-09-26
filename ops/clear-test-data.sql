-- Run only against the Chempatibility test database before the first public run.
-- One statement for SQL editors that reject multiple prepared statements.
TRUNCATE TABLE connection_state, invitations, email_sessions, email_codes, members RESTART IDENTITY CASCADE;
