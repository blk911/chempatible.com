# Updated review: form, photo, five secrets

Latest user correction supersedes the earlier promotional opening.

- Brand: chem-PATIBLE
- Immediate name/email form and Continue, with concise adult/terms consent; no extra opening CTA, illustrative portraits, decorative QR or explanatory sections
- Own photo capture, then five tap-to-advance choices with Back/correction and stale-tap protection
- After five: own photo and Instant Vibe ready to share; QR creation remains tap-only
- Five-answer invitations are valid without invented/padded answers
- After mutual Keep going, both participants complete their later five before either set is revealed; mutual chat consent follows
- Existing ten-answer accounts remain usable; stored answers are reused
- Pair reveals use immutable pair snapshots rather than later profile edits

The original question wording/categories/choices are retained. Email verification, legal consent, moderation, contact privacy, recovery and review isolation remain in place. No schema changes or production promotion.

Review the mobile form and quick flow first. Full gameplay needs the isolated test setup described in REVIEW-ROLLBACK.md. Code rollback cannot undo data changes.


### Playable preview email configuration

The review branch now fails closed for every mail recipient unless the exact address is listed in `CHEMPAT_REVIEW_EMAILS` (comma-separated, no wildcards). This covers signup/sign-in codes, invitations, and report alerts. Put only the explicitly approved test inboxes in that variable. Configure a dedicated SendGrid test key directly in Vercel, scoped to Preview and `review/instant-vibe-20260930` on `chempatible-dev`; do not copy the production key. The current mail sender is `hello@chempatible.com`, which must be verified in the selected SendGrid account. `CHEMPAT_FROM_EMAIL` is not used by the current mail implementation. Keep `CHEMPAT_REVIEW_DATA` unset until both database isolation and this mail setup are verified.


The established-lane installation supersedes the temporary branch-preview setup above: use `chempatible-dev / Production` for the stable development site backed by Git `main`, after independently verifying that environment's database. Keep `live` unchanged pending explicit promotion approval. See `REVIEW-ROLLBACK.md` for both code baselines.
