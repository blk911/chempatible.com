# DUHWILD sign-in recovery and device sessions

## Contract

- A pending sign-in code stores a small, separate navigation descriptor (email,
  purpose, challenge identifier, expiry/resend times and invitation context).
  It stores neither the one-time code nor the member cookie. Recovering an
  interrupted confirmation returns to a reviewable screen; it never replays a
  message or invitation send.
- Every load and foreground return checks `/api/member` before showing private
  cached content. Network failures, malformed responses and server failures keep
  the page in a reconnect state. A confirmed absent/expired session asks for
  sign-in. Empty display names do not count as authentication.
- New verified logins insert independent hashed session rows. Cookies remain
  host-only, Secure, HttpOnly, SameSite=Lax, with an absolute 180-day maximum.
  Resuming a session does not renew it. Authentication tokens never enter
  JavaScript storage.
- This-device logout revokes its server row and associated email proof. All-device
  logout revokes every member session and legacy email proof for that account.
  Account-bound requests recheck authorization after acquiring the member lock.
- All private API predicates, identity projections and transaction account
  binders use `duhwild_session_member`, which rejects revoked/expired sessions.
  Existing standing, verification, pair, consent and reveal-stage gates remain.
- OTP issue is atomically rate-limited to one per minute. Verification consumes
  the challenge and creates the proof/session in one SQL statement. Codes expire
  in ten minutes, allow at most five attempts and cannot be replayed. An optional
  challenge identifier supports already-open older clients without weakening
  the server-owned expiry/attempt checks.

## Migration and compatibility

Apply `migrations/20261015_member_device_sessions.sql` to the confirmed target
before publishing the code. It is additive: session table, indexes, challenge
metadata, lookup function and a compatibility trigger. It does not generate raw
login credentials, change database grants or delete member/invitation content.
Existing hashed member cookies are recorded once with a conservative fixed
expiry anchored to their existing update timestamp. Reruns never extend or revive
rows. Existing browser cookies keep their original expiry.

The compatibility trigger captures registrations and old-build token rotations
while the new deployment starts. A legacy rotation revokes its previous hash;
new-build logins do not rotate that column. Session tombstones are retained.

Do not roll back to application code that directly authenticates against
`members.session_hash`: that code ignores server revocation and cannot recognize
new independent-device cookies. Keep this additive schema and use an
auth-compatible rollback or forward fix. Never clear session tables or reset
member data as a rollback.

## Independence

Public metadata, sitemap and newly generated production invitation URLs use
`https://duhwild.com`. Review links remain in their isolated environment.
The DUHWILD SendGrid domain was confirmed verified by the owner, so outgoing
From uses `hello@duhwild.com`. Reply-To and support links retain the working
`hello@chempatible.com` mailbox until the DUHWILD reply inbox is confirmed.
No DNS, domain attachment, repository, project, secret, or mail-security
configuration is changed by this code release.

## Verification

`npm test` includes disposable local PostgreSQL (PGlite), browser DOM regressions,
and deployment-route checks. Session tests cover device coexistence, this/all
revocation, copied/expired cookie rejection across private endpoint families,
post-lock authority loss, repeatable migration, concurrent OTP verification and
resend, superseded challenges, and the five-attempt/ten-minute limits.

The DOM regressions simulate app-switch lifecycle events and refresh. A real
Chromium launch in the test workspace was blocked by its sandbox before any
browser case ran. There is no claimed real-browser, physical iPhone/Android,
or live inbox-delivery coverage. Production QA must not mint credentials for
real accounts or impersonate members.

## Deployment target

The verified public Vercel project is `chempatible`, project ID
`prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ`, and its established production branch is `live`.
Its connected Neon project is `icy-sun-87479667`, branch `br-orange-dew-b8hvaw95`,
database `neondb`. The separate development project deploys `main` against a
separate database. This migration must not be assumed present there. Publishing
only `live` keeps the unprepared development deployment unchanged; merge the
change to `main` only after separately confirming and preparing that target.
