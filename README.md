# Chempatibility prototype

Mobile-first static prototype of the member introduction and reciprocal question flow, plus a Member Profile template editor at `/admin`.

## Local preview

Run `python3 -m http.server 4173` in this directory and open `http://localhost:4173`.

This is a static demo. Registration, selfie, questions, and messages live only in the current browser tab. The QR image and invitation Send action are previews, not working cross-device features. Do not use this build to collect real member data.

The admin route has no authentication. It uses sample member data; its Member Profile draft saves only in the current browser's local storage and does not alter the public member page. Add authentication and a server-backed template store before connecting it to real member data.

The admin Questions page displays the ten drafted prompts from the prototype and five linked in-house test briefs. The remaining 40 bank questions, live assessments, scoring, and reciprocal result sharing are planned, not implemented.

## Deployment

Vercel can deploy this directory as a static site using the `Other` framework preset. The output directory is the project root; there is no build command.
