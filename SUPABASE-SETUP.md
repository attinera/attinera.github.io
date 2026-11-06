# Turning on accounts + sync (Supabase, free tier)

Attinera works without this: with no keys in `js/config.js` it runs in guest mode (everything on the device, sign-in hidden).
These steps switch on optional accounts so a closet syncs between phone and laptop. About 10 minutes, all free.

## 1. Create a free Supabase project
1. Go to https://supabase.com and sign up (GitHub sign-in is fine). The **Free** plan is enough.
2. **New project**. Name: `attinera`. Set a database password (save it somewhere; the app never needs it).
3. **Region:** pick the one closest to your users (for Toronto: *Canada (Central)* if offered, otherwise *East US (North Virginia)*).
   Put the region you chose into `privacy.html` where it says `[region to be confirmed]`.
4. Wait ~2 minutes for the project to start.

## 2. Create the tables, security rules and photo storage
1. In the project: **SQL Editor → New query**.
2. Open `supabase/setup.sql` from this folder, copy all of it, paste it in, press **Run**. It should say *Success. No rows returned.*
3. Check: **Table Editor** shows `profiles`, `items`, `locations`, `outfits`, `settings`, `saved`, each marked *RLS enabled*.
   **Storage** shows a private bucket called `closet`.

It is safe to run `setup.sql` again later.

## 3. Tell Supabase where the site lives
**Authentication → URL Configuration**
- **Site URL:** `https://attinera.github.io/`
  (until the repo moves to the `attinera` organization, use `https://jackbedard18-droid.github.io/attinera/`)
- **Redirect URLs:** add both of these, plus your local test address:
  - `https://attinera.github.io/**`
  - `https://jackbedard18-droid.github.io/attinera/**`
  - `http://localhost:8000/**`

Login links, sign-up confirmations and password-reset emails only redirect to addresses on this list.

Optional, **Authentication → Providers → Email**: leave *Confirm email* on (recommended). The free plan's built-in email
sender is limited to a few emails per hour, which is fine for testing; add your own SMTP later for a real launch.

## 4. Put the keys into the site
**Project Settings → API** (or **Data API**):
- copy **Project URL** (looks like `https://abcdefgh.supabase.co`)
- copy the **anon / public** key (a long `eyJ…` string, or a `sb_publishable_…` key)

Paste them into `js/config.js`:

```js
export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';
```

The anon key is designed to be public; Row Level Security is what keeps each person's data private.
**Never** paste the `service_role` / secret key into the site.

Commit and push. After GitHub Pages updates, **Me** shows **Sign in**, and onboarding's last step offers *Sign in / Create account*.

## How sync works (for reference)
- IndexedDB on each device stays the cache, so the app is fast and works offline.
- Every row has `updated_at`; the newest change wins. Deletes are soft (`deleted_at`) so Undo works on every device.
- Photos go to the private `closet` bucket at `user_id/item_id/cutout.jpg`, `original.jpg`, `thumb.jpg` and are fetched with short-lived signed URLs.
- Signing in on a device that has guest items asks: *"Add your N guest items to your account?"*
- **Me → Your data → Delete my account** deletes the photos, every row and the login itself (`delete_my_account()` in `setup.sql`).
