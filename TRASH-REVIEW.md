# Active, Freezer, and Trash

This release starts from dev `8f0184b3328a0a473b6a0b8b5e09aeb36d9f2242`
and live `7bdc9c2a015b320a80a041a9fcaa6d0029344e42`.

## Product behavior

- New Freeze actions end the selected invitation or connection immediately.
  Its old link cannot reopen it. Other relationships are independent.
- Invite again creates a new invitation using the same member accounts.
  Friends require a new acceptance; Vibe invitations retain the normal reveal
  and mutual chat decisions. Earlier chat permission is not reused.
- Reinviting an identified member does not reveal their private email address.
  A previously supplied or explicitly shared email may be shown to its viewer.
- Block remains separate from location. Only the person who created a block
  can remove it, and unblocking does not reopen an old connection.
- Trash hides history for the member choosing it. Restore returns that history
  to Freezer, never to an active connection. This release has no permanent purge.
- Older personal freezes retain their historical meaning. An explicit new
  Freeze is required to end those still-active connections before reinviting
  or moving them to Trash. Migration does not silently end them.
- Unknown Mystery Guest records have no identified person to invite or block.
- Known participants' previously shared photo snapshots load through a separate
  authenticated endpoint. History polling does not repeatedly carry full image
  payloads, and typing a recipient email never grants access to their profile.

## Deployment and rollback

Apply the reviewed additive migration before the new code, first on dev and
then on live. Do not delete existing invitations, activity, profiles, sessions,
messages, reports, visibility history, or blocks as part of this release.
`migrations/20261001_connection_trash.sql` adds seven columns and three indexes:
Trash/Restore timestamps on personal visibility; intended member/email, source
invitation, request hash and delivery status on invitations. No data is backfilled.

Retain the additive data when repairing or reverting code. A rollback must
preserve explicit member blocks, closed-link enforcement, intended-recipient
binding on new invitations, and personal Trash visibility. Prefer a forward
repair after these features have been used; the prior release does not know
all of the new metadata.

No private-video implementation, storage credentials, group conversations,
or invented unread-message tracking is included.

## Verification boundaries

Use synthetic database and browser-DOM fixtures for account, invitation,
mail-provider, and three-person lifecycle checks. Hosted smoke checks must not
sign in as a real member, rotate a session, send an invitation, or change a
real connection. Record final suite results and hosted verification separately.

Final local verification: all 18 test scripts pass, including actual-SQL
lifecycle/permission tests, 43 Freezer/Trash/authentication UI cases, 21 Friend
UI cases and 34 photo-composer cases. The history-photo endpoint has separate
actual-SQL ownership, payload and fail-closed guard coverage. Two old test
fixtures were aligned with the real connection-ID and transaction contracts;
their isolation and administrator-cleanup assertions remain intact.

These tests do not establish real multi-session PostgreSQL lock contention or
native iOS rendering. Authenticated hosted lifecycle actions are deliberately
not performed against real users. Public hosted checks cover deployed source,
release configuration, unauthenticated authorization and the landing page.
