import type { FastifyInstance } from "fastify";
import { businessStore } from "../store/memory.js";
import { newId } from "../lib/ids.js";
import type { Business, UpsertBusinessInput } from "../types.js";

export async function registerBusinessRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: UpsertBusinessInput }>(
    "/businesses",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "ownerName", "location"],
          properties: {
            id: { type: "string" },
            name: { type: "string", minLength: 1 },
            ownerName: { type: "string", minLength: 1 },
            barrio: { type: "string" },
            location: {
              type: "object",
              required: ["lat", "lng"],
              properties: {
                lat: { type: "number", minimum: -90, maximum: 90 },
                lng: { type: "number", minimum: -180, maximum: 180 },
              },
            },
          },
        },
      },
    },
    async (req) => {
      const input = req.body;
      const business: Business = {
        id: input.id ?? newId(),
        name: input.name,
        ownerName: input.ownerName,
        location: input.location,
        ...(input.barrio ? { barrio: input.barrio } : {}),
      };
      businessStore.upsert(business);
      return { business };
    },
  );

  app.get<{ Params: { id: string } }>("/businesses/:id", async (req, reply) => {
    const b = businessStore.get(req.params.id);
    if (!b) return reply.code(404).send({ error: "not_found" });
    return { business: b };
  });
}
