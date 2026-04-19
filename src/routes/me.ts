import type { FastifyInstance } from "fastify";
import { identityForIp } from "../lib/identity.js";

/**
 * `GET /me` — returns a stable pseudonymous identity derived from the
 * caller's IP. The YaPass client uses this to render personalised
 * greetings without forcing users through a signup flow. Deterministic
 * per-IP (see {@link identityForIp}), so the same device keeps its
 * name across reloads for the demo's lifetime.
 *
 * We disable caching so that if the `trustProxy` setting or upstream
 * forwarding changes, clients see the new name immediately instead
 * of a stale CDN copy.
 */
export async function registerMeRoute(app: FastifyInstance): Promise<void> {
  app.get("/me", async (req, reply) => {
    const identity = identityForIp(req.ip);
    reply.header("Cache-Control", "no-store");
    return identity;
  });
}
