import type { FastifyInstance } from "fastify";
import { businessStore, campaignStore } from "../store/memory.js";
import { newId } from "../lib/ids.js";
import { haversineMeters } from "../lib/distance.js";
import { bus } from "../realtime/bus.js";
import {
  CAMPAIGN_CATALOGUE,
  type Campaign,
  type CreateCampaignInput,
} from "../types.js";

const DEFAULT_RADIUS_M = 800;
const DEFAULT_DURATION_MIN = 60;

export async function registerCampaignRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateCampaignInput }>(
    "/campaigns",
    {
      schema: {
        body: {
          type: "object",
          required: ["businessId", "type"],
          properties: {
            businessId: { type: "string", minLength: 1 },
            type: {
              type: "string",
              enum: [
                "vuelve-veci",
                "refiera-una-vez",
                "compre-3-veces",
                "apure-veci",
                "descuento-al-total",
              ],
            },
            radiusM: { type: "number", minimum: 50, maximum: 100_000 },
            durationMin: { type: "number", minimum: 1, maximum: 1440 },
            discountPct: { type: "number", minimum: 1, maximum: 99 },
          },
        },
      },
    },
    async (req, reply) => {
      const { businessId, type, radiusM, durationMin, discountPct } = req.body;
      const business = businessStore.get(businessId);
      if (!business) {
        return reply.code(404).send({ error: "business_not_found" });
      }

      const meta = CAMPAIGN_CATALOGUE[type];
      const now = new Date();
      const expires = new Date(
        now.getTime() + (durationMin ?? DEFAULT_DURATION_MIN) * 60_000,
      );

      const campaign: Campaign = {
        id: newId(),
        businessId: business.id,
        business: {
          id: business.id,
          name: business.name,
          ownerName: business.ownerName,
          location: business.location,
          ...(business.barrio ? { barrio: business.barrio } : {}),
        },
        type,
        title: meta.title,
        description: meta.description,
        discountPct: discountPct ?? meta.discountPct,
        investUSD: meta.investUSD,
        reachPeople: meta.reachPeople,
        radiusM: radiusM ?? DEFAULT_RADIUS_M,
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      };

      campaignStore.save(campaign);
      const delivered = bus.broadcast(campaign);
      app.log.info(
        { campaignId: campaign.id, delivered, subscribers: bus.size() },
        "campaign broadcast",
      );

      return reply.code(201).send({ campaign, delivered });
    },
  );

  app.get<{
    Querystring: { lat: string; lng: string; radiusM?: string };
  }>(
    "/campaigns/nearby",
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

      const here = { lat, lng };
      const active = campaignStore.listActive().filter((c) => {
        const d = haversineMeters(here, c.business.location);
        return d <= Math.min(c.radiusM, radiusM);
      });

      return { campaigns: active };
    },
  );
}
