# ATTINERA — Full Site Rebuild (Claude Code prompt)

You are rebuilding my local prototype in this folder (`toronto-outfit`) into **ATTINERA**, a phone-first wardrobe + daily-readiness planner. This is a personal/school project (RSM100 business plan prototype), **not being published commercially**. Read every existing file first (`index.html`, `products.js`, `run.py`) before changing anything.

## 0. Hard rules
1. **Everything must be 100% free.** No paid APIs, no API keys, no accounts, no backend that costs money. Only free CDNs, free public APIs that need no key, and free hosting.
2. **Back up first.** Before editing, copy every current file into `backup-redesign-<YYYYMMDD-HHMMSS>/`.
3. **No build step.** Plain HTML, CSS and vanilla JavaScript (ES modules are fine) so it runs straight off GitHub Pages and by double-click / `run.py` locally.
4. **Phone first.** Design for a 390px-wide phone, then scale up to laptop.
5. Footer on every page: `© 2026 EJ Empires · ATTINERA prototype`.
6. Name is always **ATTINERA** (not Wearly, not ATTENRA).

## 1. Keep from the current site
- **Live week weather** — keep the working forecast logic, restyle it.
- **Saved stores** — keep the feature and any saved data format; migrate if the storage key changes.
- **`products.js` catalog** — keep and reuse for Shop recommendations. Do not shrink or rewrite the data; adapt the code that reads it.
- Remove the old weekly outfit planner UI; the new **Today** tab replaces it.
- Keep `run.py` working as a simple local server (`python run.py` → serves the folder, prints the LAN address so my phone on the same Wi-Fi can open it).

## 2. Brand + design system
Colours (define as CSS custom properties on `:root`):
| Token | Hex | Use |
|---|---|---|
| `--slate` | `#495867` | Main text, top bar, icons |
| `--steel` | `#577399` | Primary buttons, active tab, links, focus rings |
| `--ice` | `#BDD5EA` | Cards, chips, weather panels, input backgrounds |
| `--paper` | `#F7F7FF` | Page background |
| `--coral` | `#FE5F55` | ONLY for: needs-washing, missing piece, the main + button, destructive confirms |

- Font: system stack (`-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`). Weights 400 and 700 only.
- Rounded cards (16px radius), 16px side gutters, generous white space, photo-first cards, soft 1px `--ice` borders, no heavy shadows or gradients.
- Tap targets ≥ 44px. Respect iPhone safe areas (`env(safe-area-inset-*)`).
- Icons: an inline SVG icon set written in the project (no paid icon packs).
- **Logo:** I'm providing `attinera-logo-a.svg` (icon), `attinera-logo-lockup.svg` (icon + wordmark) and `attinera-logo-c.svg` (wordmark). Put them in `/assets/`. Use the lockup in the laptop header and splash, the icon alone in the phone top bar, as the favicon, and as the home-screen app icon (generate PNG sizes 192/512 with a script using what's installed; if nothing can rasterize, reference the SVG).

## 3. App structure
Single-page app with hash routing. Files:
```
index.html
privacy.html
terms.html
manifest.webmanifest      (installable "Add to Home Screen", standalone display, theme colour #577399)
sw.js                     (offline cache of the app shell; never cache weather responses for more than 1 hour)
assets/                   (logos, icons)
css/styles.css
js/app.js                 (router, tab bar, shared UI)
js/db.js                  (IndexedDB wrapper)
js/ai.js                  (on-device photo analysis)
js/closet.js
js/laundry.js
js/today.js               (outfit engine + day plan)
js/weather.js             (live week weather, kept + restyled)
js/shop.js                (store grid, uses products.js + saved stores)
js/settings.js
products.js               (existing, unchanged data)
run.py
```

**Navigation:** bottom tab bar on phone, left sidebar ≥ 900px wide. Tabs: **Today · Closet · Laundry · Shop · Me**. A coral floating **+** button (bottom-right, above the tab bar) opens Add Item from anywhere.

## 4. Data model (IndexedDB, database `attinera`, version 1)
Store photos as Blobs (resized to max 1024px long side, JPEG quality 0.8) plus a 256px thumbnail. Nothing leaves the device.

`items` store:
```
id, createdAt, updatedAt,
photo (Blob), thumb (Blob),
category: tops | bottoms | outerwear | formal | dresses-skirts | activewear | underwear | socks | sleepwear | shoes | accessories
subtype: e.g. t-shirt, button-up, hoodie, jeans, chinos, blazer, sneakers…
gender: mens | womens | unisex
formality: casual | smart-casual | formal
colours: [{name, hex}] (up to 3)
warmth: 1–5 (1 = summer-light, 5 = winter-heavy)
seasons: [spring, summer, fall, winter]
waterproof: boolean
status: clean | worn | hamper | washing | drying
wearCount: number since last wash
wearLimit: number (defaults per category, overridable per item)
homeLocationId
washGroup: darks | lights | colours | delicates | no-wash (shoes/accessories)
lastWorn, timesWornTotal, notes
```
`locations` store: `id, name, type (rail | drawer | shelf | rack | hook | bin), order`. Seed defaults: Closet rail, Dresser drawer 1, Dresser drawer 2, Shelf, Shoe rack, Hooks — user can rename/add/delete.

`outfits` store: `id, date, itemIds, stops, accepted (bool), wornAt`.
`settings` store: city, lat/lon, units (°C default), default wear limits, saved stores (migrated from the old format).

Add **Export / Import** (one JSON file, photos as base64) on the Me tab since data lives only in the browser.

## 5. Add Item flow (camera + free on-device AI)
1. Tap coral **+** → sheet with **Take photo** and **Choose from gallery**.
   - Take photo: if `navigator.mediaDevices.getUserMedia` is available (HTTPS or localhost), open a full-screen live rear-camera viewfinder with a dashed framing guide and a shutter button. Otherwise fall back to `<input type="file" accept="image/*" capture="environment">`.
   - Gallery: `<input type="file" accept="image/*" multiple>` for batch adding.
2. Show the photo with a "Analyzing…" state. **First use only** shows a one-time progress bar while the AI model downloads (cached afterwards; say "one-time download, works offline after").
3. **AI = Transformers.js zero-shot image classification, running in the browser** (free, no key):
   - Load `@huggingface/transformers` from jsDelivr, pipeline `zero-shot-image-classification`, model `Xenova/clip-vit-base-patch32` (quantized). Run in a Web Worker so the UI doesn't freeze.
   - Run separate label sets, each phrased as "a photo of …":
     - **Category/subtype:** t-shirt, long-sleeve shirt, button-up shirt, polo, sweater, hoodie, tank top, jeans, chinos, dress pants, shorts, sweatpants, leggings, skirt, dress, blazer, suit jacket, winter coat, rain jacket, puffer jacket, light jacket, socks, underwear, boxers, bra, pajamas, sneakers, dress shoes, boots, sandals, hat, scarf, gloves, belt, bag. Map each subtype → category.
     - **Gender:** men's clothing, women's clothing, unisex clothing. Only accept men's/women's if confidence ≥ 0.6, else `unisex`.
     - **Formality:** formal clothing, smart casual clothing, casual clothing.
     - **Weight:** thick heavy winter clothing, medium weight clothing, thin lightweight summer clothing → combine with subtype defaults to set warmth 1–5.
   - **Colours: do NOT use the AI.** Use a canvas: centre-crop 70%, downscale to 64×64, k-means (k=4) on pixels, drop the cluster closest to the image border average (background), name the top 1–3 by nearest match in a ~30-colour named palette (black, white, grey, navy, blue, light blue, green, olive, beige, brown, tan, red, burgundy, pink, purple, yellow, orange, cream, denim…).
   - Waterproof: true if subtype is rain jacket/boots and the user confirms.
4. **Confirm card:** photo + every AI guess as tappable chips (category, subtype, gender, formality, colours, warmth slider, seasons, home location dropdown, wash group). Show a small confidence hint ("pretty sure" / "check this"). Defaults for wear limit and wash group come from the category. One big **Save** button.
5. If the model fails to load (offline first run, old phone), skip straight to the confirm card with empty chips — adding must never break.

## 6. Laundry + status tracking
State cycle: **clean → worn → hamper → washing → drying → clean (put away)**.

Default wear limits (editable on Me tab): underwear 1, socks 1, sleepwear 3, activewear 1, t-shirt/tank 1, shirts/polos 2, sweaters 4, hoodies 4, jeans 5, chinos/dress pants 3, shorts 2, skirts/dresses 2, formal 3, light jackets 10, coats 20, shoes/accessories never (no-wash).

- **Mark as worn** (from Today or an item's page) → `wearCount++`, status `worn`. When `wearCount ≥ wearLimit`, status → `hamper` and the item's card gets a coral "Needs washing" chip.
- End-of-day prompt on Today: "Put today's outfit back or in the hamper?" with one tap per item.
- **Laundry tab:**
  - Hamper count at top, items grouped into suggested loads by `washGroup` (Darks / Lights / Colours / Delicates), with a "Start load" button per group → status `washing`.
  - "Move to dryer / hang dry" → `drying`; "Done" → opens the **Put-away checklist** grouped by location ("Dresser drawer 1: 3 socks, 2 boxers · Closet rail: navy tee"). Checking each sets `clean`, `wearCount = 0`.
  - Low-supply warnings in coral: e.g. "Only 2 clean pairs of socks left" (threshold per category in settings).
- Closet filters must include status, so I can see what's clean right now.

## 7. Closet tab
- Grid of photo cards (2 columns phone, 4–5 laptop), each showing status dot and wear count.
- Filter chips: category, status, gender, formality, colour, location. Search box.
- Group-by toggle: **Category** or **Location** (shows "where everything lives").
- Item detail page: big photo, all fields editable, wear history, move location, delete (coral confirm).
- Empty state: friendly illustration + "Add your first piece" button.

## 8. Today tab (replaces the weekly planner)
- **Top:** greeting, date, hour-by-hour temperature strip for the day (from the kept weather code), feels-like, rain chance, wind.
- **My day:** list of stops the user adds (time + type: Class, Work, Gym, Dinner, Date, Travel, Interview, Other). Each type has a minimum formality (Interview → formal, Date/Dinner → smart-casual, Gym → activewear).
- **Outfit engine (rule-based, free, deterministic):**
  1. Only consider `clean` items.
  2. Use the coldest feels-like temperature across the stop times to choose layers: ≥ 22°C 1 layer warmth 1–2; 15–21 light layer optional; 5–14 mid layer + light jacket; −5–4 warm layer + coat; < −5 coat warmth 5 + hat/gloves/scarf. Rain ≥ 50% → waterproof outer + "Bring umbrella".
  3. Meet the highest formality needed by any stop; if stops differ a lot, suggest a swap ("Change into activewear at the gym").
  4. Simple colour rules: avoid two loud colours together; neutrals go with anything; prefer items not worn in the last 3 days.
  5. Include underwear + socks automatically from clean supply.
- Show the outfit as a stack of item thumbnails with **Wear this**, **Shuffle**, and per-item swap buttons. "Wear this" marks all items worn.
- **Layer changes** line: e.g. "Take the hoodie off after 2 pm (19°C)."
- **Bring list:** umbrella, gloves, sunglasses, gym bag, etc.
- **Missing pieces:** if the engine can't meet a rule (no waterproof jacket, no formal shoes), show a coral chip "Missing: waterproof jacket →" that opens Shop filtered to that gap.
- Below: the **live week** forecast strip (kept feature), tap a day to preview that day's outfit.

## 9. Shop tab
- Header: "Only what you're missing." Gap chips at top (from Today's missing pieces + manual "I need…" picker).
- **Store grid** — Canadian retailers: Mark's, Sport Chek, Pro Hockey Life, Roots, Old Navy, Gap, Simons, Nike, Lululemon, Uniqlo, Winners, Value Village (second-hand). Each tile shows the store's own logo/icon loaded at runtime from `https://www.google.com/s2/favicons?domain=<store-domain>&sz=128`, with a lettered fallback tile in `--ice` if it fails to load. Heart button = **saved stores** (kept feature).
- Product suggestions come from `products.js`, filtered to the active gap and sorted by price low → high, with a "Second-hand option" card linking to Value Village / Facebook Marketplace search.
- A small grey "Preview — affiliate partnerships pending" note at the top. Links open in a new tab with `rel="noopener sponsored"`.

## 10. Me tab
City (Open-Meteo geocoding search) or "Use my location", units, style preferences (favourite colours, fit, formality), wear-limit editor, storage-location editor, low-supply thresholds, Export / Import / Erase all data (coral confirm), links to Privacy Policy and Terms.

## 11. Weather (free, no key)
Keep the existing live-week code if it already uses a free source; otherwise use **Open-Meteo** (`api.open-meteo.com/v1/forecast` with `hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m` and `daily` for 7 days, `timezone=auto`) and **Open-Meteo Geocoding** for city search. Default to Toronto. Cache responses for 1 hour in IndexedDB; show the last forecast with an "offline" badge if the fetch fails.

## 12. Draft legal pages (`privacy.html`, `terms.html`)
Both styled like the app, with a coral banner at the top: **"DRAFT — Legal review pending. Not legal advice. Prototype only."** and "Last updated: [date]".

Privacy Policy draft should state plainly:
- No account; all wardrobe data and photos are stored only in your browser on your device.
- Photo analysis runs on your device; photos are never uploaded to ATTINERA.
- The AI model files are downloaded once from a public CDN.
- Weather requests send an approximate location to Open-Meteo; store logos are requested from Google's favicon service.
- Affiliate links (future): we may earn a commission at no extra cost to you; this will be disclosed.
- How to export or erase your data (Me tab).
- Placeholder sections: children's privacy, Canadian privacy law compliance (PIPEDA), contact `[email to be added]`.

Terms draft: prototype provided "as is", outfit and weather suggestions are guidance only, user owns their photos, third-party store links are not controlled by us, trademarks and logos belong to their owners and are shown for preview purposes only, placeholder governing-law section (Ontario, Canada).

## 13. Hosting (free)
- Make the site work from **GitHub Pages** (relative paths everywhere, `404.html` that redirects to `index.html`).
- Write a short `DEPLOY.md`: create a free GitHub repo, upload the folder, Settings → Pages → Deploy from branch `main` / root, then open the `https://<user>.github.io/<repo>/` link on the phone (HTTPS → live camera works). Note: free GitHub Pages needs a **public** repo; mention **Netlify Drop** (drag-and-drop the folder, free) as the alternative if I want the code private.

## 14. Quality checklist (verify before you finish)
- [ ] Backup folder created; old saved stores still appear after migration.
- [ ] Works at 360px, 390px, 768px and 1280px wide with no horizontal scroll.
- [ ] Add item works with camera, gallery, batch upload, and with the AI unavailable.
- [ ] Item survives a page reload (IndexedDB) and Export → Erase → Import restores everything including photos.
- [ ] Wearing an outfit increments counts; socks/underwear go straight to the hamper; full laundry cycle ends with the put-away checklist by location.
- [ ] Today never suggests a non-clean item; missing-piece chip links to a filtered Shop.
- [ ] Weather loads for Toronto and a searched city; offline badge shows when offline.
- [ ] Store logos load, fallback tiles appear when a logo fails.
- [ ] Coral is used only for alerts, missing pieces, the + button and destructive confirms.
- [ ] Privacy and Terms pages show the DRAFT banner; footer shows © 2026 EJ Empires.
- [ ] No console errors; no paid service or API key anywhere in the code.

When done, give me: what changed, how to run it locally (`python run.py`), and the exact GitHub Pages steps.
