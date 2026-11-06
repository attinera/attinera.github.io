# Deploying ATTINERA (free)

## GitHub Pages
1. Create a free account at github.com, then **New repository** (e.g. `attinera`). Free GitHub Pages needs the repo to be **Public**.
2. On the repo page: **Add file → Upload files**. Drag in everything in this folder **except** the `backup-*` folders. Commit to `main`.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save.**
4. Wait 1–2 minutes. Your site is at `https://<your-username>.github.io/<repo>/`.
5. Open that link on your phone. It is HTTPS, so the live camera viewfinder works. In Safari: Share → **Add to Home Screen**. In Chrome: menu → **Install app**.

To update: upload the changed files again (same names) and commit. Reload twice on the phone to pick up the new version.

## Want the code private? Netlify Drop
Go to https://app.netlify.com/drop, sign in free, and drag this whole folder onto the page. You get a free HTTPS link straight away; no public repo needed.

## Local
`python run.py` serves the folder at http://localhost:8000 and prints a LAN address for your phone on the same Wi-Fi.
On the LAN address (plain http) phones block the live camera, so **Take photo** opens the phone's own camera app instead. Everything else works.
