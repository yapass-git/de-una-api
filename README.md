# deuna-api

Realtime backend for the Deuna demo. Receives campaign launches from
**deuna-negocios** (Martha's point-of-sale) and fans them out via
Server-Sent Events to nearby users of **yapass-next**.

Stack: Fastify 5 + TypeScript + in-memory store + SSE. No database —
restart wipes state (intentional for the MVP).

## Endpoints

| Method | Path                   | Description                                                                       |
| ------ | ---------------------- | --------------------------------------------------------------------------------- |
| GET    | `/health`              | Liveness probe.                                                                    |
| POST   | `/businesses`          | Upsert a shop (`{ id?, name, ownerName, location, barrio? }`).                     |
| GET    | `/businesses/:id`      | Fetch a single shop.                                                               |
| POST   | `/campaigns`           | Launch a campaign. Derives title/description/reach from `type`. **Broadcasts SSE.** |
| GET    | `/campaigns/nearby`    | `?lat&lng&radiusM` — active campaigns within radius. Used on page load.            |
| GET    | `/campaigns/stream`    | `?lat&lng&radiusM` — SSE stream (`hello`, `campaign`, periodic `ping`).            |

`type` is one of `vuelve-veci | refiera-una-vez | compre-3-veces | apure-veci`.

## Local dev

```bash
cd deuna-api
cp .env.example .env   # optional — PORT defaults to 4000
npm install
npm run dev            # tsx watch on http://localhost:4000
```

Sanity check:

```bash
curl http://localhost:4000/health
```

## End-to-end demo (3 terminals)

Run each block in its own terminal. Both fronts need `NEXT_PUBLIC_API_URL`
pointing at the API.

```bash
# 1. backend
cd deuna-api && npm run dev
```

```bash
# 2. YaPass (the end user — Veci)
cd yapass-next
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > .env.local
npm run dev
# open: http://localhost:3000/?mock=-0.2080,-78.4879
```

```bash
# 3. Deuna Negocios (Martha)
cd deuna-negocios
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > .env.local
npm run dev -- -p 3001
# open: http://localhost:3001/?mock=-0.2082,-78.4882
```

### Flow

1. In **deuna-negocios** → tab *Promociones* → pick "Vuelva Veci" → *Continuar*.
2. On the *Alcance* screen → *Continuar*. The app:
   - upserts `biz-martha-la-vicentina`,
   - `POST /campaigns`,
   - redirects home with `?campaign=launched`.
3. In **yapass-next** the `CampaignAlertModal` pops up within ~1 s.

### `?mock=lat,lng`

Both fronts honor a `?mock=lat,lng` query param that overrides GPS.
Useful to pretend two browser windows on the same laptop are standing
in different neighborhoods — no geolocation prompt, no VPN, no magic.

Any point within 800 m of Martha's shop (`-0.2082, -78.4882`) will
receive the push. A safe "near" point is `-0.2080, -78.4879`; a safe
"far" point is `-0.1800, -78.4800` (Centro Histórico — outside radius,
will **not** see the modal, which is the feature).

## Production build

```bash
npm run build   # emits dist/
npm start       # node dist/server.js
```

## Deploy

### Backend → Fly.io

SSE needs a persistent, always-warm VM — so **serverless platforms
(Vercel / Netlify / Cloudflare Workers) are the wrong shape here**.
Fly's "one tiny VM kept hot" model is perfect for an MVP.

```bash
# Once per machine
brew install flyctl   # or: iwr https://fly.io/install.ps1 -useb | iex
flyctl auth login

# From the deuna-api directory
cd deuna-api
flyctl launch --no-deploy --copy-config --name deuna-api --region gru
# (keep the fly.toml we committed — it pins min_machines_running=1)
flyctl deploy
```

The resulting URL looks like `https://deuna-api.fly.dev`. Verify:

```bash
curl https://deuna-api.fly.dev/health
```

If you own a custom domain:

```bash
flyctl certs create api.example.com
# add the CNAME/A records it prints; then
flyctl certs show api.example.com
```

#### Environment

| Key                 | Required | Notes                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------- |
| `PORT`              | no       | Set in `fly.toml`. Fly also injects it automatically.                  |
| `CORS_EXTRA_ORIGIN` | no       | Extra origin allowed beyond `localhost:*` and `*.vercel.app`.          |
| `LOG_LEVEL`         | no       | Defaults to `info`. Set to `debug` temporarily when investigating.     |

```bash
flyctl secrets set CORS_EXTRA_ORIGIN=https://deuna.example.com
```

### Fronts → Vercel

For **each** front (`yapass-next` and `deuna-negocios`):

1. `vercel link` (or import in the dashboard).
2. Project Settings → Environment Variables → add for every env
   (Production, Preview, Development):
   - `NEXT_PUBLIC_API_URL = https://deuna-api.fly.dev`
3. Redeploy. The `*.vercel.app` hostname is already whitelisted by the
   backend CORS layer, so no further config is needed on preview URLs.

### Smoke test in production

```bash
# Open yapass-next
https://yapass-next.vercel.app/?mock=-0.2080,-78.4879

# In another tab launch a campaign from deuna-negocios
https://deuna-negocios.vercel.app/?mock=-0.2082,-78.4882
# → Promociones → "Vuelva Veci" → Continuar → Continuar
```

The YaPass tab should flash the `CampaignAlertModal` within ~1 s.
