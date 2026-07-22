# ELARAWAVE Backend

Node.js + Express API for the ELARAWAVE frontend (`src/lib/api.ts`). Matches
every endpoint the frontend already calls — no frontend files were touched.

- **Database:** Supabase (Postgres)
- **Email/OTP:** Brevo (Sendinblue) transactional email
- **Auth:** JWT (separate secrets for users vs admin), bcrypt password hashing
- **Config:** 100% environment variables — nothing secret is hardcoded anywhere in the code

## 1. Create the Supabase project

1. Create a project at supabase.com.
2. Project Settings → Database → Connection string (URI) → copy it. That's your `DATABASE_URL`.

## 2. Create the Brevo account

1. Sign up at brevo.com, verify a sender email/domain.
2. Settings → SMTP & API → API Keys → generate a key. That's `BREVO_API_KEY`.

## 3. Configure environment variables

Copy `.env.example` → `.env` locally, or set the same keys in Render's
dashboard (Environment tab). See `.env.example` for what each one does.
Generate strong random JWT secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run that twice — once for `JWT_USER_SECRET`, once for `JWT_ADMIN_SECRET`.
Never reuse the same secret for both.

## 4. Install, migrate, seed the admin account

```bash
npm install
npm run db:migrate       # creates all tables in Supabase
npm run db:seed-admin    # reads ADMIN_USERNAME / ADMIN_PASSWORD from env,
                          # stores a bcrypt hash in admin_users (never plaintext)
```

Set `ADMIN_USERNAME` / `ADMIN_PASSWORD` in your env before running the seed
script — for example `adminelarawave` / a password you choose. After seeding,
you can rotate the password any time via `POST /api/admin/credentials`
(used by the admin panel's "change credentials" screen), or by re-running
`db:seed-admin` with new values.

## 5. Run locally / deploy

```bash
npm run dev     # local dev, auto-restarts on change
npm start        # production
```

**On Render:** New → Web Service → connect this repo/folder → Build command
`npm install`, Start command `npm start`. Add all env vars from
`.env.example` under the Environment tab (a `render.yaml` blueprint is
included if you prefer Render's Blueprints feature). Set `FRONTEND_URL` to
your deployed frontend's exact origin (no trailing slash) — CORS blocks
everything else by default.

Finally, point the frontend at this backend by setting its `VITE_API_URL`
to this service's Render URL.

## AI bottle mockup endpoint ("Enhance with AI")

`src/components/sections/BottleConfigurator.tsx` on the frontend has a
`generateWithAI()` stub (currently fake — just a delay + the same static
image). This backend now implements the real endpoint it's meant to call:

```
POST /api/customizer/generate
Body: { "bottleId": "...", "gradient": "...", "brand": "..." }
Response: { "images": { "front": "data:image/png;base64,...", "back": "...", "top": "...", "bottom": "..." } }
```

It uses the Hugging Face Inference API (model configurable via
`HUGGINGFACE_MODEL`, default `black-forest-labs/FLUX.1-schnell`). Get a
token at https://huggingface.co/settings/tokens and set
`HUGGINGFACE_API_KEY`. If that key is left blank, this one endpoint
returns a clear `503` — everything else in the backend still works.

Rate-limited to 5 requests / 10 minutes per IP (`aiGenerateLimiter` in
`src/middleware/rateLimit.js`) since each call is slow and costs money —
tune that if needed. To wire the frontend up, replace the stub's body in
`generateWithAI()` with a `fetch("<API_BASE_URL>/api/customizer/generate", { method: "POST", ... })`
call and return `data.images`.

## Live Google reviews on the site ("Google Reviews" section)

`GET /api/reviews` now merges the business's **real, live Google reviews**
with site-submitted reviews (newest first). This uses the Google Places
API (Place Details, `reviews` field) — same key style as the AI feature
above:

1. Go to console.cloud.google.com → create or select a project.
2. **APIs & Services → Library** → enable **"Places API"**.
3. **APIs & Services → Credentials → Create Credentials → API key.**
   Restrict it (API restrictions → Places API only) so it's useless to
   anyone even if it leaks.
4. Find the client's **Place ID** (a string like `ChIJ...`) using Google's
   finder tool: https://developers.google.com/maps/documentation/places/web-service/place-id
   — search the exact business name + address, copy the Place ID shown.
5. Set both in Render's Environment tab:
   ```
   GOOGLE_PLACES_API_KEY=your_key_here
   GOOGLE_PLACE_ID=the_place_id_here
   ```

If either is left blank, this is completely safe — the endpoint just
returns site-submitted reviews only, no error, nothing else affected.
Results are cached in memory for `GOOGLE_REVIEWS_CACHE_MINUTES` (default
60) so we don't burn API quota on every page load.

**Important limitation (this is Google's limit, not ours):** the Places
API only ever returns up to **5 reviews** per business, no matter the
plan or key. If the client wants literally all their Google reviews shown,
that's not possible through this API — 5 is the hard cap Google imposes.

There's also a bonus `GET /api/reviews/summary` endpoint returning
`{ googleRating, googleTotalReviews, configured }` in case the frontend
later wants a "4.8★ from 230 Google reviews" badge above the cards.

## Security notes

- Passwords hashed with bcrypt (cost 12, tunable via `BCRYPT_COST`).
- OTP codes are 6-digit, cryptographically random, hashed before storage,
  expire in 10 minutes, capped at 5 attempts, and rate-limited on
  send/verify/resend.
- User and admin tokens are signed with **separate** secrets, so a leaked
  user token can never be replayed as an admin token.
- `helmet`, `hpp`, CORS allow-list, and tiered rate limiting (tighter on
  login/OTP/admin-login) are applied globally.
- Login and password-reset responses never reveal whether an email/username
  exists (generic error messages, always-200 on forgot-password).
- All queries are parameterized (`pg` placeholders) — no string-built SQL.
- Avatar uploads are stored on local disk under `/uploads` for simplicity.
  Render's disk is **ephemeral** (wiped on redeploy) — swap
  `src/routes/auth.js`'s upload handler for a Supabase Storage bucket
  upload before relying on this in production; the route contract (`POST
  /api/auth/avatar` → `{ url }`) stays the same either way.
- Rotate `ADMIN_PASSWORD` after first login, and consider removing
  `ADMIN_USERNAME`/`ADMIN_PASSWORD` from Render's env after the first
  `db:seed-admin` run since they're only needed for that one script.
