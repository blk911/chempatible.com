# Chempatibility walkthrough

A mobile-first, static two-person game prototype. Serve this directory with `python3 -m http.server 4173` and open `http://localhost:4173`.

## Walkthrough

1. On a phone, enter a name and email or cell, then tap **Next Step**. Choose a picture or use the camera. A welcome modal shows the photo; **Step 3 — Open My Page** opens the member profile and its ten-question prompt.
2. On the member page, tap **Let's Play My Ten**. The ten default, three-choice situations appear one at a time in the right side of the top card. **My 10** appears below after the first saved answer and fills in with each question and choice. The invitation unlocks when all ten have answers.
3. Open **Connect Now**, then use **Simulate a scan on this device** to enter the prospect view. It shows the inviter's photo and name beside **Five to Vibe**. The left card previews the first question and three choices; the inviter's selected answer stays hidden.
4. Tap **Play My Five** to answer one question at a time in the right card. After five, the prospect adds a picture and compares answers. Matching choices are green; different choices are grey. The request screen keeps the inviter's card visible and lets the prospect change or retake their own picture before entering a first name and cell.
5. The prospect sees a waiting card after sending. Switch to the member view: **Chempats** displays the requester's picture, name, masked cell, and Accept/Pass controls. Accept opens the chat; Pass closes this demo connection. Switch back to the prospect view to answer the next five after acceptance. Review the second reveal, enter email, and open the test briefs.

The **View as** button switches between the two people in the same browser tab. One stable demo connection ID ties their invitation and request screens together. Walkthrough state lives in `sessionStorage`. Use **RESET** in the header to clear the current browser tab and begin again. An incognito window has its own storage and cannot share this demo’s answers or chat with the regular window.

## Prototype limits

The QR marker is a visual preview. Sending an invitation prepares local demo data only. There is no shared account, real QR destination, email or text delivery, phone verification, server-backed chat, or live test assessment. Prospect contact appears masked in the member view. The `/admin` route has no login; its question and template drafts remain separate from this public walkthrough. Do not collect real member data in this static build.

## Deployment

Vercel can deploy the directory as a static site with the `Other` framework preset, no build command and the project root as output directory.
