import type { Business, Campaign } from "../types.js";

/**
 * Process-local state. We keep it deliberately small and in-memory for
 * the MVP: the moment we need durability or horizontal scale we can
 * swap these `Map`s for a SQLite/Postgres repository behind the same
 * functions and no route has to change.
 */
const businesses = new Map<string, Business>();
const campaigns = new Map<string, Campaign>();

export const businessStore = {
  upsert(business: Business): Business {
    businesses.set(business.id, business);
    return business;
  },
  get(id: string): Business | undefined {
    return businesses.get(id);
  },
  list(): Business[] {
    return Array.from(businesses.values());
  },
};

export const campaignStore = {
  save(campaign: Campaign): Campaign {
    campaigns.set(campaign.id, campaign);
    return campaign;
  },
  get(id: string): Campaign | undefined {
    return campaigns.get(id);
  },
  /** Campaigns whose `expiresAt` is still in the future. */
  listActive(now: Date = new Date()): Campaign[] {
    const cutoff = now.getTime();
    return Array.from(campaigns.values()).filter(
      (c) => new Date(c.expiresAt).getTime() > cutoff,
    );
  },
  /** Every campaign ever created for a business, newest first. */
  listByBusiness(businessId: string): Campaign[] {
    return Array.from(campaigns.values())
      .filter((c) => c.businessId === businessId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  },
};
