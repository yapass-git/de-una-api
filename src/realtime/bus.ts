import type { Campaign, Location } from "../types.js";
import { haversineMeters } from "../lib/distance.js";

export type Subscriber = {
  id: string;
  location: Location;
  /** Radius the user is willing to receive alerts from, in meters. */
  radiusM: number;
  /**
   * Writes an SSE frame to the underlying HTTP response. The route is
   * in charge of the actual `res.write` so the bus has zero knowledge
   * of Fastify internals.
   */
  send: (event: string, data: unknown) => void;
};

const subscribers = new Map<string, Subscriber>();

export const bus = {
  subscribe(sub: Subscriber): () => void {
    subscribers.set(sub.id, sub);
    return () => {
      subscribers.delete(sub.id);
    };
  },
  size(): number {
    return subscribers.size;
  },
  /**
   * Fan a freshly created campaign out to every subscriber whose
   * current location is within the campaign's radius *and* the user's
   * own preferred radius (whichever is smaller wins — the smaller
   * radius is always the more restrictive preference).
   */
  broadcast(campaign: Campaign): number {
    let delivered = 0;
    for (const sub of subscribers.values()) {
      const d = haversineMeters(sub.location, campaign.business.location);
      const reach = Math.min(sub.radiusM, campaign.radiusM);
      if (d <= reach) {
        sub.send("campaign", campaign);
        delivered++;
      }
    }
    return delivered;
  },
};
