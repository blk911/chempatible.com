# Instant Vibe review checklist

This is a proposal against the current live experience, not a production replacement.

## Additions versus behavior changes

- Additions: visual invitation opening, clearer stage/waiting labels, authenticated received-connection recovery, review guard and rollback documentation
- Behavior changes to discuss: signup starts behind the Create my Instant Vibe button; existing saved details/answers are reused; new connections reveal the next five before mutual chat approval rather than opening chat immediately after the first request
- Privacy corrections: contacts and unrevealed answers are no longer sent early to the other browser
- Preserved: existing chats, photos/reactions, email verification, adult/terms consent, QR claiming/expiry, reporting and unmatch; no question-bank/schema replacement

## What to review

1. **Opening:** an illustrated two-person invitation, five locked secrets, and a clear Create my Instant Vibe entry. Illustrations represent placeholders, not real members. No actual questions or answer choices appear on the public opening.
2. **Signup:** keep the existing email code, photo, adult/terms consent, reporting, and unmatch safeguards. Explain why an account is needed. Use saved account details and existing answers rather than collecting them again.
3. **Connection sequence:** reveal five; the visitor chooses Keep going; the inviter chooses Keep going or Pass; complete/reveal five more; the visitor asks to chat; the inviter chooses Open chat or Pass. This is an intentional behavior change for discussion. Existing open chats, including old second-round chats, stay open.
4. **Returning:** sent and received connections belong to the authenticated account, with each person's photo and a clear indication of whose decision is next. A stored browser token is no longer the sole route back to a linked connection.
5. **Inviting next:** create an Instant Vibe using saved answers. A 15-minute in-person QR and an emailed private invitation remain clearly different actions.
6. **Privacy:** registration email/phone are not included in the inviter's response. Explicit later email sharing is separate. Neither invitation endpoint nor premature chat can reveal the second five early.

## Acceptance checks before any production promotion

- Complete two synthetic-person sessions for QR and email on an isolated preview database
- Reload, close/reopen, log out/in, switch sent/received connections, and expire an unclaimed QR
- Confirm first-phone QR claiming, account ownership, contact redaction, staged answers, mutual decisions, reactions, photos, reporting and unmatch
- Confirm expected mobile and desktop layouts in a real browser
- Confirm whether review's new staged consent sequence should replace live's earlier chat opening
- Plan how any newly created staged sessions remain usable if code is rolled back
- Obtain explicit production promotion approval

## Verification boundary

Automated suites use synthetic SQL/mail mocks and DOM-based browser simulations. They do not prove actual Postgres execution, SendGrid delivery, deployed Vercel environment isolation, or real-device camera behavior. The static preview can be reviewed safely while its API gate stays closed. See REVIEW-ROLLBACK.md for exact baseline and restrictions.

## Compatibility notes

Email invitation links remain forwardable bearer invitations until the first member binds the connection. After binding, only that signed-in member can resume the received connection; an old token or QR cookie alone is insufficient. The tests simulate logout/session rotation rather than real email delivery.
