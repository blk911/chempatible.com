# chem-PATIBLE review walkthrough

A mobile-first two-person game with live QR and email invitations. The static page can be served locally with `python3 -m http.server 4173`; invitations require Vercel and the database below.

## Walkthrough

This branch is an isolated review proposal; data APIs are disabled by default. See `docs/REVIEW-ROLLBACK.md` before configuring an isolated test database and mail setup.

1. The mobile-first landing page immediately shows name/email, adult/terms consent, and Continue. Email verification remains part of the signup safety flow.
2. Take or choose your own photo. Then create five secrets with one short situation at a time. Tap a choice to advance; Back lets you correct accidental choices. The question meanings and choices are unchanged.
3. After five, your own photo and Instant Vibe action are ready. A QR is minted only when you tap the action, never while rendering a page. The in-person code lasts fifteen minutes; the email path sends a separate invitation.
4. The other person creates their first five and both sets reveal. Existing account details and answers are reused.
5. Both choose Keep going before the next round. Each completes five more; neither person's next-five answers are revealed until both are complete. Then both decide whether to open chat.

Both accounts can recover sent and received connections after signing in. QR claims and expiry, email verification, report/unmatch, contact privacy, and existing chat access remain supported. No database schema changes are introduced. A code rollback cannot roll back new data or staged sessions.

## Prototype limits

QR scanning and email invitations are live on the deployed domain. There is no text delivery or phone verification. Deeper discoveries are briefs, not completed games. The admin Questions and Templates pages are drafts saved only in the browser; they are separate from the public game.

## Moderation and admin

Either person can **Unmatch** or **Report** a connection at any stage after the first five. Both end the connection for both people, close the chat, and hide contact details. A report also records a reason, an optional note, and a copy of the chat, adds a private admin-only note to the reported member's page, and emails the admin. Reports count as strikes against the reported member: the 3rd pauses them for 30 days, the 4th blocks them from playing. Paused or blocked members can still unmatch and report, but cannot make codes, send invitations, answer invitations, or message, and a blocked email or cell cannot sign up again. Dismissing a report in admin removes its strike but does not lift a pause or block; use Reinstate for that.

`/admin` requires signing in with a six digit code emailed to the admin address (`blk911@gmail.com`, or `CHEMPAT_ADMIN_EMAIL`). `middleware.js` keeps the admin page and scripts behind that sign-in and `/api/admin` checks it on every request. Sessions last 12 hours and are signed with `ADMIN_SESSION_SECRET` if set, otherwise with `DATABASE_URL`. Dash, Members, Reports and Activity read live data; every game step is written to the `activity` table by `api/_ops.mjs`, which also creates the moderation tables and columns on first use.

## Deployment

Vercel can deploy the repository with the `Other` framework preset and no build command. The QR drawing code is bundled in the static `qr-client.js`; the server creates the invitation record and returns its URL.

To enable live email:

1. Create a dedicated Neon Postgres database for Chempatibility and run `schema.sql` in its SQL editor, one statement at a time if required. Existing databases need the four QR columns in `api/qr-schema.mjs` before deploying this version.
2. Authenticate `chempatible.com` in SendGrid, adding its required DNS records in GoDaddy, and create a restricted Mail Send API key.
3. In the Chempatibility Vercel project, set Production environment variables `DATABASE_URL` (Neon connection string) and `SENDGRID_API_KEY`. Authenticate `chempatible.com` as a sender domain in SendGrid for `hello@chempatible.com`. Redeploy after adding the variables. Never commit keys.
4. Register a member using their own email, answer ten, open **Connect Now → Can’t scan? Send it instead**, and send to a second email in a separate browser. The sender gets a six digit email code before the first send. A successful SendGrid API response means accepted for delivery, not proof of inbox arrival.

QR codes require `DATABASE_URL`; email also requires `SENDGRID_API_KEY` and an authenticated `chempatible.com` sender domain.

## Development and live

`main` is the development branch. `live` is the public release branch. Set the existing Vercel project to continue using `main` on its Vercel URL; create a second Vercel project from this same repository using `live` as its production branch. Give each project its **own Neon database** and `DATABASE_URL`. Give the live project `SENDGRID_API_KEY`, authenticate `chempatible.com` in SendGrid, and assign `chempatible.com` to the live Vercel project after removing it from the development project. The outgoing From address is `hello@chempatible.com` with display name `Chempatibility`. Keep the development deployment on its Vercel URL. Verify the live URL before moving the domain.

Run `ops/clear-test-data.sql` in the old test database before a fresh test. It removes all members, pair records, messages, QR and email invitations, email codes, and sessions. Browser tabs will start a fresh walkthrough with this release; older server cookies no longer match a member or session after the reset. Never run this reset against a database containing public member data.

Promote tested changes by merging or fast-forwarding `main` into `live`, then confirm the live deployment. Do not point both Vercel projects at the same database.
