# Deploying Attinera (free)

## Where it lives
- Now: `https://jackbedard18-droid.github.io/attinera/` (repo `jackbedard18-droid/attinera`, Pages from `main` / root).
- Planned: `https://attinera.github.io/` once the repo moves to the free **attinera** GitHub organization.

All paths in the site are relative, so the same files work at both addresses (domain root and `/attinera/`).
`manifest.webmanifest` uses `start_url: "./#today"` and `scope: "./"`, which resolve correctly at either one.

## Moving to attinera.github.io
1. Create the free organization **attinera** on GitHub (github.com → your avatar → Your organizations → New organization → Free).
2. Transfer and rename the repo (needs `gh` signed in as the repo owner):
   ```
   gh api repos/jackbedard18-droid/attinera/transfer -f new_owner=attinera -f new_name=attinera.github.io
   ```
3. Point the local clone at the new home:
   ```
   git remote set-url origin https://github.com/attinera/attinera.github.io.git
   ```
4. Turn on Pages: repo **Settings → Pages → Deploy from a branch → `main` / `/ (root)` → Save**, or
   ```
   gh api -X POST repos/attinera/attinera.github.io/pages -f "source[branch]=main" -f "source[path]=/"
   ```
5. Wait 1–2 minutes, then open `https://attinera.github.io/`.
6. Supabase: set **Authentication → URL Configuration → Site URL** to `https://attinera.github.io/` (see `SUPABASE-SETUP.md`).

GitHub redirects the old repo URL to the new one, but **not** the old Pages address. Phones that installed the old
address should open the new link and add it to the home screen again (data does not carry across addresses unless
the user signs in, which syncs it).

## Updating
Commit and push to `main`. Pages rebuilds in about a minute. Reload twice on the phone to pick up the new version
(the service worker cache version in `sw.js` changes with each release).

## Local
`python run.py` serves the folder at http://localhost:8000 and prints a LAN address for your phone on the same Wi-Fi.
On the LAN address (plain http) phones block the live camera, so **Take photo** opens the phone's own camera app instead.
Everything else works. `node js/check.mjs` runs the logic self-checks.
