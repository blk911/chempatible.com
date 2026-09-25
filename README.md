# Chempatibility walkthrough

A mobile-first two-person game prototype with a Vercel email invitation endpoint. Serve the static walkthrough with `python3 -m http.server 4173`; the live email endpoint requires Vercel and the services below.

## Walkthrough

1. On a phone, enter a name and email or cell, then tap **Next Step**. Choose a picture or use the camera. A welcome modal shows the photo; **Step 3 — Open My Page** opens the member profile and its ten-question prompt.
2. On the member page, tap **Let's Play My Ten**. The ten default, three-choice situations appear one at a time in the right side of the top card. **My 10** appears below after the first saved answer and fills in with each question and choice. The invitation unlocks when all ten have answers.
3. Open **Connect Now**. The email option verifies the member’s email and sends an invitation with their picture, name, and **Let’s talk!** The recipient link opens the inviter’s first-five page on another phone. **Simulate a scan on this device** is still available for the remaining local walkthrough.  It shows the inviter's large photo and name beside **Five to Vibe**. The two-column card below reuses the member's ten-question layout: short prompt and **Play My Five** on the left, a blank question panel on the right.
4. Tap **Play My Five** to load one question at a time in that right panel. The inviter's selected answers stay hidden until the five-question reveal. After five, the prospect adds a picture and compares answers. Matching choices are green; different choices are grey. The request screen keeps the inviter's card visible and lets the prospect change or retake their own picture before entering a first name and cell.
5. The prospect sees a waiting card after sending. In the member browser, **Chempats** receives the requester’s picture, name, masked cell, and Accept/Pass controls. Accept opens a shared chat; the recipient browser advances automatically. The next five and their reveal sync between the two browsers. The prospect can then add an email and open the test briefs.

The **View as** button remains for the same-tab visual walkthrough. Email invitations create a shared connection record; the member and prospect browser poll for changes every five seconds while open. The current page state lives in `sessionStorage`. Use **RESET** in the header to clear that browser tab. An incognito window has separate local state, but its invitation link shares the connection through the server.

## Prototype limits

The QR marker is a visual preview. Email invitations use a verified sender address and a private link; the first-five reveal, request, decision, chat, and next-five answers sync across the two browsers. There is no real QR destination, text delivery, phone verification, or live test assessment. Prospect contact appears masked in the member view. The `/admin` route has no login; its question and template drafts remain separate from this public walkthrough. Do not collect real member data in this static build.

## Deployment

Vercel can deploy the repository with the `Other` framework preset and no build command. The `/api/email` Node function installs `@neondatabase/serverless` from `package-lock.json`.

To enable live email:

1. Create a dedicated Neon Postgres database for Chempatibility and run `schema.sql` in its SQL editor. If the first three tables already exist, run the final `CREATE TABLE IF NOT EXISTS connection_state` statement separately. The Vercel Query editor accepts one statement per run.
2. Authenticate `chempatible.com` in SendGrid, adding its required DNS records in GoDaddy, and create a restricted Mail Send API key.
3. In the Chempatibility Vercel project, set Production environment variables `DATABASE_URL` (Neon connection string), `SENDGRID_API_KEY`, and `CHEMPAT_FROM_EMAIL` (for example `hello@chempatible.com`, once verified). Redeploy after adding them. Never commit keys.
4. Register a member using their own email, answer ten, open **Connect Now → Can’t scan? Send it instead**, and send to a second email in a separate browser. The sender gets a six digit email code before the first send. A successful SendGrid API response means accepted for delivery, not proof of inbox arrival.

Without these three environment variables, the endpoint responds with 503 and the send UI shows a setup message.

## Clean test run

After deploying the new code and creating `connection_state`, run this one statement in the dedicated Chempatibility database to remove test invitations, sessions, and codes:

```sql
TRUNCATE TABLE connection_state, invitations, email_sessions, email_codes;
```

The new `walkthrough.v4` browser storage key starts both browsers with a clean page on reload. This database command invalidates previous emailed invitation links and verification sessions.
