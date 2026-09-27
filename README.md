# Purl — branded links for your deployments

Deploy platforms give you URLs like `my-app-8f3k2.vercel.app` or
`fancy-panda-abc123.netlify.app`. They work, but they don't represent your brand.

Purl turns any deployed URL into a clean branded link:

1. **Paste your deployed URL** — Purl scrapes its title/description.
2. **Describe your brand** — AI suggests brandable links like `your-domain/roast-and-ritual`.
3. **Claim it** — the branded URL serves your brand's link-preview tags and
   redirects human visitors to your real deployment.

Perfect for resumes, bios, pitch decks, DMs — anywhere a first impression matters.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Supabase (Postgres) for link mappings, RLS on — all DB access via server routes
- Provider-agnostic AI via the OpenAI SDK (OpenAI / Groq / OpenRouter / Ollama)
- Cheerio for metadata scraping

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values
```

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier works).
2. In the Dashboard → **SQL Editor**, paste the contents of
   [`supabase/schema.sql`](./supabase/schema.sql) and click **Run**.
3. In **Project Settings → API**, copy the Project URL, anon key and
   `service_role` key into `.env.local`.

### 2. AI suggestions (optional)

Without an API key the app still works — suggestions come from a smart
heuristic engine (brand name + keyword extraction). Add any OpenAI-compatible
key to unlock AI suggestions. **NVIDIA NIM** is a first-class provider — grab a
free key at [build.nvidia.com](https://build.nvidia.com) and it's auto-detected:

```
NVIDIA_API_KEY=nvapi-...
# defaults applied automatically:
#   base URL: https://integrate.api.nvidia.com/v1
#   model:    meta/llama-3.3-70b-instruct
```

Other providers — set `AI_API_KEY` (+ `AI_BASE_URL`/`AI_MODEL` as needed):

```
# Groq (free tier)
AI_API_KEY=gsk_...
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama-3.3-70b-versatile

# OpenAI
OPENAI_API_KEY=sk-...
```

## How redirects work

`https://your-host/<slug>` is a server-rendered page that:

- emits the site's **real title/description as OpenGraph tags**, so shared-link
  previews (WhatsApp, Slack, X, iMessage) show the brand, not Purl;
- JS-redirects human visitors (~600 ms) to the target deployment;
- bots never run JS, so unfurlers only ever see the branded preview;
- increments a click counter via a Postgres RPC.

## Branded link host

Links are shown as `<host>/<slug>` where `<host>` is wherever the app runs —
`localhost:3000` in dev, your Vercel/Netlify domain in production. No custom
domain required. After deploying, optionally set `NEXT_PUBLIC_BRAND_HOST` in
your env so server-rendered text (API error messages) matches your domain.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/metadata?url=` | GET | Scrape title/description/site name for a URL |
| `/api/suggest` | POST | `{ url, userDescription }` → available slug suggestions (AI + heuristics) |
| `/api/links` | POST | `{ slug, url }` → claim a branded link |
| `/api/links?url=` | GET | List links claimed for a target URL |

## Scripts

```bash
npm run dev      # start dev server
npm run build    # production build
npm run lint     # eslint
```
