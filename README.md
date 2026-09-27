# Glowup — give your deploy URL a glow up

Deploy platforms give you URLs like `beamdrop-6ym9.onrender.com` or
`my-app-8f3k2.vercel.app`. They work, but they don't represent your project.

Glowup turns any deployed URL into a clean branded link:

1. **Paste your deployed URL** — Glowup reads its title and description.
2. **Describe your project** — AI suggests brandable names, or type your own.
3. **Claim it** — `your-app.vercel.app/your-name` now opens your real site,
   unfurls with your project's title in chats, and comes with a control room.

No domain, no DNS, no code. The branded link lives at `<host>/<slug>` wherever
Glowup itself is deployed.

## Features

- **Branded redirects** — `/<slug>` instantly sends visitors to the real
  deployment. Link unfurlers (WhatsApp, X, Slack, iMessage) see the project's
  title, description, and an auto-generated preview card instead of a bare URL.
- **AI name suggestions** — provider-agnostic (NVIDIA NIM by default, also
  OpenAI / Groq / OpenRouter / Ollama). Works without a key too: a heuristic
  engine derives names from the site title and your description.
- **Control room** (`/manage`) — per-link dashboard: live click stats,
  14-day chart, referrers, countries, devices, QR code, and a link picker for
  everything claimed on the device.
- **Editable destination** — redeployed? Update where the link points; the
  pretty URL never changes.
- **Bio-page mode** — flip a switch and `/<slug>` becomes a Linktree-style
  mini page (avatar/monogram, tagline, up to 8 links). With no links filled
  in, it flashes the brand card and auto-redirects.
- **QR codes** — for resumes, posters, and slides.
- **Click analytics** — every redirect records referrer, country, and device
  class, all stored encrypted.

## Security model

Glowup is built so the database alone reveals nothing about users:

- **Application-layer encryption (AES-256-GCM)** — destination URLs, titles,
  descriptions, bio fields, and every analytics datum (referrer, country,
  device) are encrypted by the app before they reach Postgres. The DB stores
  only ciphertext; old plaintext rows are re-encrypted lazily on first touch.
  The key never leaves the server (`GLOWUP_ENCRYPTION_KEY`).
- **Hashed manage tokens** — ownership tokens are stored only as HMAC-SHA256
  hashes. A stolen database cannot take over anyone's link.
- **SSRF-hardened scraper** — user-supplied URLs are DNS-resolved and checked
  against private/loopback/link-local ranges (including cloud metadata
  endpoints), redirects are followed manually with re-validation, ports are
  locked to 80/443, and responses are capped at 512 KB.
- **No enumeration** — there is no endpoint that lists links by target URL.
- **Rate limits** on claims, suggestions, scraping, edits, and deletes.
- **Security headers** — HSTS (preload), `X-Frame-Options: DENY`, `nosniff`,
  strict `Referrer-Policy`, restrictive `Permissions-Policy`.
- **RLS everywhere** — both tables deny the anon key by default; all reads and
  writes go through server routes using the service-role key.

One honest limit, by design: the server must know each destination URL to
perform the redirect — that is the product. Everything else about a user is
opaque to the database.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- Supabase (Postgres) for links and click events
- Provider-agnostic AI via the OpenAI SDK (NVIDIA NIM, OpenAI, Groq,
  OpenRouter, Ollama)
- Cheerio for metadata scraping, `qrcode` for QR generation,
  `next/og` for dynamic preview cards

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values
```

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier works).
2. In the Dashboard → **SQL Editor**, run these files in order:
   - [`supabase/schema.sql`](./supabase/schema.sql) — links table + RLS
   - [`supabase/migration-002.sql`](./supabase/migration-002.sql) — manage
     tokens, bio fields, click events
   - [`supabase/migration-003.sql`](./supabase/migration-003.sql) — token default
   - [`supabase/migration-004.sql`](./supabase/migration-004.sql) — bio avatar
   - [`supabase/migration-005.sql`](./supabase/migration-005.sql) — hashed tokens
3. Copy the Project URL, anon key, and `service_role` key into `.env.local`.

### 2. Encryption key (required)

```bash
openssl rand -base64 32
```

Put the result in `GLOWUP_ENCRYPTION_KEY` (`.env.local` locally, Vercel env
vars in production) and **back it up** — losing it makes stored data
permanently unreadable.

### 3. AI suggestions (optional)

NVIDIA NIM is the default — grab a free key at
[build.nvidia.com](https://build.nvidia.com) and set `NVIDIA_API_KEY`. Without
any key the app falls back to smart heuristic suggestions. Other providers:

```bash
# Groq
AI_API_KEY=gsk_...
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama-3.3-70b-versatile

# OpenAI
OPENAI_API_KEY=sk-...
```

### 4. Deploying

Any Node host works; Vercel is the path of least resistance (import the repo,
paste the env vars, deploy). The UI auto-detects its own host, so branded
links work immediately on the deployed domain — a custom domain is optional
(set `NEXT_PUBLIC_BRAND_HOST` if you want server-rendered text to match one).

## How redirects work

`/<slug>` is a server-rendered page that:

- emits the project's **real title/description as OpenGraph tags** plus an
  auto-generated preview card, so shared links unfurl with the brand;
- JS-redirects human visitors (~600 ms) to the destination — or shows the bio
  page when bio mode is on;
- records an encrypted click event (referrer, country, device) per visit,
  skipping bot/prefetch traffic.

## API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/metadata?url=` | GET | Scrape title/description/site name for a URL |
| `/api/suggest` | POST | `{ url, userDescription }` → available slug suggestions |
| `/api/links` | POST | `{ slug, url }` → claim a link (returns a one-time manage token) |
| `/api/manage` | GET/PATCH/DELETE | Token-authenticated stats, edits, deletion |
| `/api/manage/check` | POST | Batch-validate tokens (body, never URLs) |

## Scripts

```bash
npm run dev      # start dev server
npm run build    # production build
npm run lint     # eslint
```
