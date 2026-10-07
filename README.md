# Chem-patible development

A mobile-first two-person game with live QR and email invitations. The static page can be served locally with `python3 -m http.server 4173`; invitations require Vercel and the database below.

## My profile

The My profile control beside the member avatar opens the existing account's
name, picture and read-only sign-in email. Camera/file pictures are previewed
before Save. Private phone editing reuses the Step 2 reward control and does not
offer a number to any connection. Current identity appears in eligible active
connections; original invitation/history snapshots remain unchanged. Updating an
already-listed discovery name/photo is a separate checkbox on Save, preserving
listing and video publication choices. See `docs/MEMBER-PROFILE.md` for the
entry/endpoint matrix, authorization, tests and rollout.

## Five-level reward game

The five-level game uses saved First 5 / Second 5 answers, then
three original five-question rounds. Rewards offer invitations, mutual phone
exchange, individual connection status, opt-in authenticated member discovery,
and a private-first 15-second MP4 introduction. Nothing is automatically listed
or shared, and existing chat remains available. Optional questionnaires remain
inside connection games; their saved results appear under My game results.
See `docs/FIVE-LEVEL-REWARDS.md` for
consent, video limits, additive migrations, test scope, and rollback. Reward, directory and
in-app request endpoints support verified isolated development and explicitly
configured trusted production. All member authorization, consent and lifecycle
checks remain required; see `docs/RELEASE-MODE.md` for the fail-closed gate.

## Game Pieces guide

The compact five-card progress display stays at the top of My page. Its
`detail...` link opens the **Game Pieces** disclosure below **My secrets**, moves
keyboard focus to its summary, and scrolls there without opening a modal or
adding browser history. Reduced-motion preferences use an immediate scroll.

Five roomy cards explain Email, Cell, Duhwildcards, Be discovered, and Your 15
seconds, with actions routed through the existing reward controls. Status comes
from the same server-owned reward progress; the guide adds no eligibility flags
or sharing actions. The real **My game results** collection stays underneath,
with its saved optional-game results and privacy choices unchanged. See
`tests/game-piece-cards-ui.test.mjs` for navigation, state, consent-copy, focus,
and responsive CSSOM regressions. No schema or API changes are required.

## Walkthrough

`main` is the development branch; `live` is the separate public release branch. Data APIs remain disabled by default. Development gameplay requires a verified isolated database and approved test inboxes; see `docs/REVIEW-ROLLBACK.md`. Preparing source for release does not enable public mail or promote the live site.

1. The mobile-first landing page immediately shows name/email, adult/terms consent, and Continue. Email verification remains part of the signup safety flow.
2. Take or choose your own photo. Then create five secrets with one short situation at a time. Tap a choice to advance; Back lets you correct accidental choices. The question meanings and choices are unchanged.
3. After five, your own photo and Instant Vibe action are ready. A QR is minted only when you tap the action, never while rendering a page. The in-person code lasts fifteen minutes; the email path sends a separate invitation.
4. The other person creates their first five and both sets reveal. Existing account details and answers are reused.
5. Both choose Keep going before the next round. Each completes five more; neither person's next-five answers are revealed until both are complete. Then both decide whether to open chat.

Both accounts can recover sent and received connections after signing in. QR claims and expiry, email verification, report/unmatch, contact privacy, and existing chat access remain supported. No database schema changes are introduced. A code rollback cannot roll back new data or staged sessions.

## Friends

Share with a friend creates a separate, single-use link lasting seven days. Share it directly with the intended friend. Opening it shows the inviter; it does not connect accounts. The recipient signs in or registers with verified email, adult consent, and a photo, then explicitly chooses Connect as friends. This opens a private friends chat without answering or revealing romantic questions. Friends and Vibe connections remain separate, and either person can unmatch or report. A friend-only profile can create its first five later to send a Vibe invitation.

Friend links use the existing invitation and connection tables with server-owned `channel='friend'`; no schema migration is required. They send no automatic invitation email and expose no answers or contact details. See `docs/FRIENDS-RELEASE.md` for release and rollback details.

## Prototype limits

QR scanning and email invitations are live on the deployed domain. There is no text delivery or phone verification. Optional connection games are implemented after chat opens; see `docs/DISCOVERY-GAMES.md` for modules, consent, persistence, and release checks. The admin Questions and Templates pages are drafts saved only in the browser; they are separate from the public game.

## Moderation and admin

Either person can **Unmatch** or **Report** a connection at any stage after the first five. Both end the connection for both people, close the chat, and hide contact details. A report also records a reason, an optional note, and a copy of the chat, adds a private admin-only note to the reported member's page, and emails the admin. Reports count as strikes against the reported member: the 3rd pauses them for 30 days, the 4th blocks them from playing. Paused or blocked members can still unmatch and report, but cannot make codes, send invitations, answer invitations, or message, and a blocked email or cell cannot sign up again. Dismissing a report in admin removes its strike but does not lift a pause or block; use Reinstate for that.

`/admin` requires signing in with a six digit code emailed to the address in `CHEMPAT_ADMIN_EMAIL`. The server and middleware have no hardcoded personal-address fallback: missing or malformed configuration disables admin access. Set this variable to the existing authorized admin address in **chempatible-dev / Production** before deploying this cleanup, and verify it separately in the live project before any future public promotion. This preserves the current admin identity; it does not add another administrator. In development, the address must also be in `CHEMPAT_REVIEW_EMAILS` for codes and report alerts to be delivered.

`middleware.js` keeps the admin page and scripts behind sign-in and `/api/admin` checks it on every request. Sessions last 12 hours and are signed with `ADMIN_SESSION_SECRET` if set, otherwise with `DATABASE_URL`. Dash, Members, Reports and Activity read live data; every game step is written to the `activity` table by `api/_ops.mjs`, which also creates the moderation tables and columns on first use. Reports are still stored and strikes applied if admin email is unconfigured; the failed notification is logged without sending to an unknown address.

## Deployment

Vercel can deploy the repository with the `Other` framework preset and no build command. The QR drawing code is bundled in the static `qr-client.js`; the server creates the invitation record and returns its URL.

`.vercelignore` explicitly allows only the runtime pages, styles, scripts, brand assets, API modules, middleware, and package/deployment manifests. Tests, review documents, schema SQL, local settings, screenshots, recordings, and exports stay out of the deployed application. Add each new runtime asset to this allowlist deliberately. Keep the regression tests in development and run `npm test` before preparing changes for review.

For development email and gameplay:

1. Verify the development project's `DATABASE_URL` points to its own isolated Neon database. `schema.sql` and the existing API schema helpers describe the required tables and columns; review initialization separately before using a new database.
2. Verify `SENDGRID_API_KEY` and the authenticated sender `hello@chempatible.com` belong to the approved development mail setup. Never commit keys.
3. In **chempatible-dev / Production** (Vercel's name for the stable development target), use `CHEMPAT_REVIEW_EMAILS` for the exact approved test inboxes. Only after database and mail isolation are verified, set `CHEMPAT_REVIEW_DATA=isolated-confirmed`. Review-branch Preview variables do not configure the stable development URL.
4. Use approved test inboxes in separate browsers to verify email codes, photos, first-five answers, tap-created QR invitations, separate email invitations, both Keep going choices, next-five reveal, and mutual chat. A successful SendGrid API response means accepted for delivery, not proof of inbox arrival.

QR codes require `DATABASE_URL`; email also requires `SENDGRID_API_KEY` and an authenticated `chempatible.com` sender domain.

## Development and live

`main` serves the `chempatible-dev` project's development URL. `live` serves the separate `chempatible` public project. Each project must retain its **own Neon database** and `DATABASE_URL`. The outgoing From address is `hello@chempatible.com` with display name `Chem-patible`.

The obsolete whole-database reset script has been removed. Source cleanup does not delete stored members, contacts, invitations, messages, or browser sessions. Any future data cleanup requires identifying the specific database and records, checking a recovery plan, and obtaining separate authorization. Never reset a database to roll back code.

Public promotion requires separate approval and a configuration/compatibility review. Source is now capable of both deployment modes; preparing this code does not enable live behavior. See `docs/RELEASE-MODE.md` for exact configuration, verification, and rollback requirements.

Development defaults to review mode. Keep `CHEMPAT_RELEASE_MODE` unset (or `review`), `CHEMPAT_REVIEW_DATA=isolated-confirmed` only after isolation is verified, and the exact `CHEMPAT_REVIEW_EMAILS` allowlist. The review banner and noindex response header remain on development and previews. Invalid release settings fail closed.

Only `CHEMPAT_RELEASE_MODE=live` together with Vercel's server-supplied public-project ID, Production environment, `live` Git ref, and `VERCEL=1` enables public recipients and data APIs. The live project cannot use the review-isolation flag as a substitute. Missing or mismatched identity disables operations. This check uses no request headers, hostname, query parameter, or browser storage. Admin authentication, email verification, member consent, and moderation remain required in live mode.

`/api/config` exposes only a no-store `reviewOnly` boolean and returns 503 when deployment configuration is blocked. The notice starts hidden, stays hidden for confirmed live mode, and shows “Review version” only after review mode is confirmed. Failed or malformed responses show a neutral service-unavailable notice. Data and mail APIs enforce their server-side gates independently. Routing middleware applies noindex to every non-live response and always to admin/API routes; `vercel.json` retains the other security headers. No build-time rewrite of deployment configuration is used. Follow `docs/REVIEW-ROLLBACK.md` for staged-session compatibility before an authorized promotion.
