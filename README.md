# Chempatibility walkthrough

A mobile-first two-person game with live QR and email invitations. The static page can be served locally with `python3 -m http.server 4173`; invitations require Vercel and the database below.

## Walkthrough

1. On a phone, enter a name and email or cell, then tap **Next Step**. Choose a picture or use the camera. A welcome modal shows the photo; **Step 3 — Open My Page** opens the member profile and its ten-question prompt.
2. On the member page, tap **Let's Play My Ten**. The ten default, three-choice situations appear one at a time in the right side of the top card. **My 10** appears below after the first saved answer and fills in with each question and choice. The invitation unlocks when all ten have answers.
3. Open **Instant Vibe**. A fresh QR code is stored for this pair and remains available for fifteen minutes. The first other phone to scan claims it and opens the inviter’s first-five page. The inviter can instead choose **Can’t scan? Send it instead**; that path verifies their email and sends a private link. Every new code or email invitation has a separate pair ID. The first-five page shows the inviter’s photo and name beside **Five to Vibe**.
4. Tap **Play My Five** to load one question at a time in that right panel. The inviter's selected answers stay hidden until the five-question reveal. After five, the prospect adds a picture and compares answers. Matching choices are green; different choices are grey. The request screen keeps the inviter's card visible and lets the prospect change or retake their own picture before entering a first name and cell.
5. After the five and a picture, the visitor becomes a member and the inviter sees their name and picture in **Chempats**. The visitor can request a connection; the inviter can Accept/Pass. Accept opens a shared chat, and the next five sync between both browsers.

QR and email invitations create the same shared connection record. Both browsers poll for changes every five seconds while open. A scanned QR is bound to the first browser that opens it. The current page state lives in `sessionStorage`; the QR claim also has a device cookie so a reload on that phone can continue.

## Prototype limits

QR scanning and email invitations are live on the deployed domain. There is no text delivery or phone verification. Deeper discoveries are briefs, not completed games. The `/admin` route has no login; its question and template drafts remain separate from the public game.

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
