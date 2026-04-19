import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerBusinessRoutes } from "./routes/businesses.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerMeRoute } from "./routes/me.js";
import { registerStreamRoute } from "./routes/stream.js";
import { runSeed } from "./seed.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

/**
 * CORS: we want to accept both local dev and any Vercel preview URL
 * without having to redeploy every time a branch spins up a new
 * `*.vercel.app` hostname. In production we additionally let the user
 * inject a custom domain through `CORS_EXTRA_ORIGIN`.
 */
function isOriginAllowed(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    if (url.hostname.endsWith(".vercel.app")) return true;
    const extra = process.env.CORS_EXTRA_ORIGIN;
    if (extra && origin === extra) return true;
    return false;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
    // Fly.io (and any Vercel/Cloudflare-style proxy in front of us)
    // forwards the real client IP through `X-Forwarded-For`. We need
    // the accurate IP so `GET /me` can deterministically assign a
    // display name per visitor instead of everyone sharing the proxy
    // address. `true` = trust one hop, which matches Fly's topology.
    trustProxy: true,
  });

  await app.register(cors, {
    origin(origin, cb) {
      // Curl / same-origin / server-to-server have no Origin header —
      // allow them to keep health checks and manual testing easy.
      if (!origin) return cb(null, true);
      if (isOriginAllowed(origin)) return cb(null, true);
      cb(new Error(`origin_not_allowed: ${origin}`), false);
    },
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
  });

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  await registerBusinessRoutes(app);
  await registerCampaignRoutes(app);
  await registerMeRoute(app);
  await registerStreamRoute(app);

  runSeed();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`deuna-api listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
