import type { FastifyInstance } from "fastify";
import { bus } from "../realtime/bus.js";
import { newId } from "../lib/ids.js";

const DEFAULT_RADIUS_M = 800;
const PING_INTERVAL_MS = 20_000;

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

      const raw = reply.raw;
      raw.statusCode = 200;
      raw.setHeader("Content-Type", "text/event-stream");
      raw.setHeader("Cache-Control", "no-cache, no-transform");
      raw.setHeader("Connection", "keep-alive");
      raw.setHeader("X-Accel-Buffering", "no");
      // Flush headers so the browser opens the stream immediately
      // instead of waiting for the first body chunk.
      raw.flushHeaders?.();

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

      // Signal to Fastify that we're taking over the socket lifetime.
      // Returning `reply` tells it not to try to send a body of its
      // own on top of our chunked stream.
      return reply;
    },
  );
}
