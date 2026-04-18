import type { FastifyInstance } from "fastify";
import { bus } from "../realtime/bus.js";
import { newId } from "../lib/ids.js";

const DEFAULT_RADIUS_M = 800;
const PING_INTERVAL_MS = 10_000;
/**
 * Comment line appended after every SSE frame. Fly's edge (Envoy/HTTP/2)
 * holds small frames inside its outbound buffer until either enough
 * bytes accumulate or the window ticks — which for tiny `campaign`
 * events means seconds of delay. Tagging each frame with a ~2KB
 * comment pushes it over the flush threshold immediately.
 */
const FRAME_PAD = `:${" ".repeat(2048)}\n\n`;

/**
 * SSE endpoint. Each connection registers itself in the `bus` and
 * stays open until either side hangs up. Keep-alive pings every 20s
 * stop intermediate proxies (nginx, Cloudflare, Fly's edge) from
 * silently closing an idle HTTP response.
 */
export async function registerStreamRoute(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: { lat: string; lng: string; radiusM?: string };
  }>(
    "/campaigns/stream",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["lat", "lng"],
          properties: {
            lat: { type: "string" },
            lng: { type: "string" },
            radiusM: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const radiusM = req.query.radiusM
        ? Number(req.query.radiusM)
        : DEFAULT_RADIUS_M;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return reply.code(400).send({ error: "invalid_coordinates" });
      }

      // Let @fastify/cors (and any other onRequest hook) add their headers
      // to `reply` first, then copy them onto the raw response. Without
      // this, cross-origin EventSource connections are rejected because
      // access-control-allow-origin never makes it to the wire.
      reply.header("Content-Type", "text/event-stream");
      reply.header("Cache-Control", "no-cache, no-transform");
      reply.header("Connection", "keep-alive");
      reply.header("X-Accel-Buffering", "no");

      const raw = reply.raw;
      raw.statusCode = 200;
      const accumulated = reply.getHeaders();
      for (const [key, value] of Object.entries(accumulated)) {
        if (value === undefined) continue;
        raw.setHeader(key, value as number | string | readonly string[]);
      }
      // Tell Fastify we own the socket now — it must not try to send
      // another response on top of our chunked stream.
      reply.hijack();
      raw.flushHeaders?.();

      // Flush headers + first useful chunk immediately: without this,
      // the initial write is held back by HTTP/2 framing on Fly's
      // edge and the client's `open` event fires only after the first
      // significant payload arrives.
      raw.write(FRAME_PAD);

      const subId = newId();
      const send = (event: string, data: unknown): void => {
        if (raw.destroyed || raw.writableEnded) return;
        // Each outgoing event is followed by another 2KB pad so the
        // Fly edge flushes it to the browser straight away instead of
        // holding on to the tiny ~400B payload.
        raw.write(`event: ${event}\n`);
        raw.write(`data: ${JSON.stringify(data)}\n\n`);
        raw.write(FRAME_PAD);
      };

      const unsubscribe = bus.subscribe({
        id: subId,
        location: { lat, lng },
        radiusM,
        send,
      });

      // Handshake: lets the client confirm the server honored its
      // subscription params (useful when debugging over curl).
      send("hello", { id: subId, location: { lat, lng }, radiusM });

      // Aggressive keep-alive: every 10s we ship a padded comment to
      // keep Fly's edge from declaring the connection idle AND to
      // drain any micro-frames still sitting in its buffer.
      const ping = setInterval(() => {
        if (raw.destroyed || raw.writableEnded) return;
        raw.write(`: ping ${Date.now()}\n\n`);
        raw.write(FRAME_PAD);
      }, PING_INTERVAL_MS);

      const cleanup = (): void => {
        clearInterval(ping);
        unsubscribe();
      };

      req.raw.on("close", cleanup);
      reply.raw.on("close", cleanup);
    },
  );
}
