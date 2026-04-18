import type { FastifyInstance } from "fastify";
import { bus } from "../realtime/bus.js";
import { newId } from "../lib/ids.js";

const DEFAULT_RADIUS_M = 800;
const PING_INTERVAL_MS = 15_000;

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

      // Some intermediaries (HTTP/2 proxies, fly-proxy in certain paths,
      // nginx without `X-Accel-Buffering: no`) hold on to tiny SSE frames
      // until a buffer threshold is met, which means live `campaign`
      // events can arrive seconds — or never — after we write them.
      // Pushing a ~2KB comment as the very first byte forces the proxy
      // to flush immediately, and from then on every subsequent frame
      // ships in real time.
      raw.write(`:${" ".repeat(2048)}\n\n`);

      const subId = newId();
      const send = (event: string, data: unknown): void => {
        if (raw.destroyed || raw.writableEnded) return;
        raw.write(`event: ${event}\n`);
        raw.write(`data: ${JSON.stringify(data)}\n\n`);
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

      // Shorter keep-alive (every 15s instead of 20s) so Fly's edge
      // definitely sees traffic well within its idle-close window and
      // can't decide the connection is dead.
      const ping = setInterval(() => {
        if (raw.destroyed || raw.writableEnded) return;
        raw.write(`: ping ${Date.now()}\n\n`);
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
