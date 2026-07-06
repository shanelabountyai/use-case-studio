# SETUP — run and deploy AI Use-Case Studio

Click-by-click, in order. Two parts: **A** gets it running locally, **B** deploys to Vercel. Budget ~20–30 min the first time. Where a console's exact wording may have shifted, the step is described by what you're doing so you can still find it.

Env var names must match the app exactly: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. Copy `.env.example` to `.env` and fill as you go.

---

## Prerequisites
- Node 20+ and npm.
- Accounts (all have free tiers): GitHub, Vercel, Neon, Google Cloud.

---

## Part A — Run it locally

### 1. Unpack and initialize
```bash
unzip use-case-studio-starter.zip && cd use-case-studio
git init && git add -A && git commit -m "M0: starter"
npm install
```

### 2. Database (Neon)
1. At neon.tech, create a project (any region near you).
2. On the project dashboard, open the **Connection Details** widget and copy the **pooled** connection string (ends with `?sslmode=require`).
3. Paste it into `.env` as `DATABASE_URL="..."`.

> Note: the app's runtime driver (`@neondatabase/serverless`) is happy with the pooled URL. If `db:migrate` ever errors on the pooled endpoint, use Neon's **direct/unpooled** connection string for migrations only.

### 3. Auth secret
```bash
npx auth secret        # writes AUTH_SECRET into .env automatically
```

### 4. Google OAuth (sign-in)
Google's setup now lives under the **Google Auth Platform**.
1. In the Google Cloud Console, create or select a project.
2. **APIs & Services → OAuth consent screen** (aka Google Auth Platform overview) → **Get started**. Set an app name and your support email; for **Audience** choose **External**; add a contact email. Save.
3. Go to **Clients → Create client**. Application type: **Web application**. Name it anything.
4. Under **Authorized redirect URIs**, add exactly:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
   (You'll add the production URL in Part B.)
5. **Create**, then copy the **Client ID** and **Client secret** — the secret is shown only once. Put them in `.env` as `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
6. While the app's publishing status is **Testing**, only listed test users can sign in. Either add your own Google address as a test user now, or publish to **Production** (Part B) — because this app only requests basic `email`/`profile`/`openid` scopes, publishing does **not** require Google's app-verification review.

### 5. Create tables and verify
```bash
npm run db:generate   # generate migration from src/db/schema.ts
npm run db:migrate    # apply to your Neon database
npm run test          # engine suite must pass BEFORE anything else
npm run dev           # http://localhost:3000
```
Sign in with Google, land on `/studio`. (The full four-stage UI is the Fable brief's M2 — the shell proves auth + DB work end to end.)

---

## Part B — Deploy to Vercel

### 1. Push to GitHub
Create an empty GitHub repo, then:
```bash
git remote add origin git@github.com:<you>/use-case-studio.git
git push -u origin main
```

### 2. Import in Vercel
Vercel Dashboard → **Add New → Project** → import the repo. It auto-detects Next.js. Don't deploy yet — set env vars first.

### 3. Database in production (pick one)
- **Easiest — Neon Marketplace integration:** Vercel → **Storage** (or the **Marketplace** → Neon) → add Neon. Choose *Vercel-Managed* (billing via Vercel, creates the Neon project for you) or *Neon-Managed* (link your existing Neon account). It injects `DATABASE_URL` (pooled) — and `DATABASE_URL_UNPOOLED` — into Production/Preview automatically.
- **Manual:** add `DATABASE_URL` yourself in **Settings → Environment Variables**, using your Neon pooled string. If a leftover `DATABASE_URL`/`PG*` var conflicts with the integration later, remove it first.

### 4. Remaining env vars (Settings → Environment Variables)
Add for **Production**:
- `AUTH_SECRET` — reuse local or generate a fresh one.
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — same client is fine.
- On the default `*.vercel.app` domain you don't need `AUTH_URL` — Auth.js v5 auto-detects the host on Vercel. (If you hit a host/URL error, add `AUTH_URL=https://<project>.vercel.app`. For a custom domain later, see the section at the end.)

### 5. Add the production redirect URI in Google
You're on Vercel's default domain for now. After import, Vercel shows your production URL as `https://<project>.vercel.app` (Project → **Settings → Domains**). Back in **Google Auth Platform → Clients → your web client → Authorized redirect URIs**, add exactly:
```
https://<project>.vercel.app/api/auth/callback/google
```
Keep the localhost URI too — one client holds both. It must match character-for-character or sign-in fails with `redirect_uri_mismatch`. (Preview deployments get their own random `*.vercel.app` URLs and won't accept sign-in unless added — fine for v1; test on the production URL.)

### 6. Apply migrations to the production DB
Simplest one-time approach: locally, temporarily point `DATABASE_URL` at the production Neon string and run `npm run db:migrate`, then revert. (Or add a migrate step to the Vercel build override, per the Fable brief's M4.)

### 7. Deploy, then open the app
Trigger the deploy. If your OAuth app is still in **Testing**, publish it to **Production** (or keep adding test users) so anyone can sign in.

---

## Later — switching to a custom domain
When you're ready to move off `*.vercel.app`, it's a config change only — no code moves:
1. **Vercel → your project → Settings → Domains** → add your domain and follow the DNS instructions (add the CNAME/A record at your registrar). Wait for it to verify.
2. **Google Auth Platform → Clients → your web client → Authorized redirect URIs** → add `https://<your-domain>/api/auth/callback/google`. Leave the old `*.vercel.app` URI in place until the new one is confirmed working, then remove it if you like.
3. **Vercel → Settings → Environment Variables** → set `AUTH_URL=https://<your-domain>` (Production). Auto-detection is fine on `*.vercel.app`, but once a custom domain is canonical, pinning `AUTH_URL` prevents callback-host mismatches.
4. Redeploy so the env change takes effect.

---

## Common gotchas
- **`redirect_uri_mismatch`** — the URI in Google must be character-for-character `.../api/auth/callback/google` on the right origin (localhost for dev, your domain for prod). Both can coexist on one client.
- **Only you can sign in** — the OAuth app is in Testing; add test users or publish to Production.
- **Env var name** — it must be `DATABASE_URL` (not `POSTGRES_URL`); that's what the app reads.
- **Secret shown once** — if you didn't copy the Google client secret, add a new one on the client's page and update the env var.
- **Migrations on pooled endpoint** — if they error, run `db:migrate` against Neon's direct/unpooled URL.

Once local sign-in + save works and the engine tests pass, hand the repo to Claude Code with: *"Read FABLE-BRIEF.md and execute it milestone by milestone."*
