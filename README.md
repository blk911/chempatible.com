# Chempatibility walkthrough

A mobile-first, static two-person game prototype. Serve this directory with `python3 -m http.server 4173` and open `http://localhost:4173`.

## Walkthrough

1. On a phone, enter a name and email or cell and choose a picture or open the camera beneath the inputs. The selected or captured photo appears beside the form and opens a welcome modal; **Enter the Game** opens the member page.
2. Answer ten default, three-choice situations. The invitation unlocks when all ten have answers.
3. Open **Connect Now**, then use **Simulate a scan on this device** to enter the prospect view. It shows the member's first name and picture and invites them to **Five to Vibe**.
4. Answer the first five as the prospect. Compare the two sets of answers side by side. Upload the prospect picture, then send a first-name and cell connection request.
5. Switch to the member view, accept from **Chempats**, and open the chat. Switch back to the prospect view to answer the next five. Review the second reveal, enter email, and open the test briefs.

The **View as** button switches between the two people in the same browser tab. Walkthrough state lives in `sessionStorage`. Use **RESET** in the header to clear the current browser tab and begin again. The new build also starts with an empty walkthrough. An incognito window has its own storage and cannot share this demo’s answers or chat with the regular window.

## Prototype limits

The QR marker is a visual preview. Sending an invitation prepares local demo data only. There is no shared account, real QR destination, email or text delivery, phone verification, server-backed chat, or live test assessment. Prospect contact appears masked in the member view. The `/admin` route has no login; its question and template drafts remain separate from this public walkthrough. Do not collect real member data in this static build.

## Deployment

Vercel can deploy the directory as a static site with the `Other` framework preset, no build command and the project root as output directory.
