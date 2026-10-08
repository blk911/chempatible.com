# Bside invitation preview and sending

The invitation dialog now opens with **Preview / Send**. That action only previews
an email. The host can inspect the real sender, recipient, subject, HTML email and
plain-text alternative, edit the subject/personal message, then choose **Send**.
The private acceptance link is created only at Send; the preview uses an inactive
placeholder. The recipient still must sign in with the invited email and explicitly
accept. Existing approval, blocking and original-trial rules remain in force.

The email uses a cream, charcoal, pink and lime Bside card with the headline
“There’s a B-side. Come on in.” It contains no remote tracking images. SendGrid
receives both HTML and plain text with click/open tracking disabled. Success means
the provider accepted the message, never proof of inbox delivery.

## Safety and parity

- Preview authenticates the host and checks the recipient without database writes,
  invitation creation, provider calls, or background mail/billing dispatch.
- A signed 30-minute receipt binds the host, community, recipient, subject, message,
  sender and rendered-content fingerprint. New sends reject changed previews.
- A receipt identifies one send attempt. Concurrent calls cannot send twice. A
  confirmed provider rejection permits retry of the same receipt; an ambiguous
  result is retained and cannot be blindly resent. Stored outcomes are recoverable
  after the preview expires.
- Editable fields are plain text with server length/control-character validation
  and HTML escaping. The acceptance URL remains server-owned.
- Preview iframes have an empty sandbox, are inert, and have no script privileges.
  CSP allows only same-origin frames and hashes of the renderer’s fixed inline
  styles. It does not allow arbitrary inline styles or scripts.
- Closing, Cancel, Back, navigation, permission loss and delayed responses preserve
  the dialog’s current owner. Closing after Send cannot cancel a submitted email.

## Verification

Tests use synthetic accounts, PGlite and mocked email/fetch. No real invitations,
external inboxes, production database mutations or payments are needed. The local
source snapshot contains the complete suite and its existing test dependencies.

The public repository includes a portable subset that tests the actual hosted files.
Use Node.js 24.15 or newer on the 24.x line, install the repository dependencies
with `npm ci`, then run:

```sh
node --test tests/bside-invitation/*.test.mjs
node --test tests/wild-hub-returning-signin.test.mjs
```

The invitation subset has 29 checks. The full local source suite passed all 420
checks with no skips before release; all 25 packaged source hashes matched.

DOM/CSSOM tests establish the authored responsive and accessibility structure.
Actual browser/CSP rendering and inbox-client appearance are separate checks and
were not established by these offline tests.

## Release boundary

Runtime changes are confined to the nine changed files under `wild-hub-hosted/`,
including its source manifest and generated Vercel header configuration. No schema,
credentials, provider configuration, domain, billing or Duh Wild main/live changes
are required. The baseline is Bside commit
`c3c59ff12a5d8303f8abe5908dff4ea6f2ac7d82`.
