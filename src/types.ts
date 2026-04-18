/**
 * Domain types for Deuna-API.
 *
 * Duplicated verbatim into each front-end under `src/lib/api-types.ts`.
 * Keeping a copy per project (instead of a shared package) avoids the
 * overhead of turning the workspace into a monorepo for a handful of
 * types; any change here must be mirrored on the clients.
 */

export type Location = {
  lat: number;
  lng: number;
};

/**
 * Campaign catalogue — mirrors the 4 cards in
 * `deuna-negocios/src/app/(tabs)/promociones/page.tsx`. The API accepts
 * the id from the client and derives the rest of the metadata
 * server-side so the two apps can't drift out of sync.
 */
export type CampaignType =
  | "vuelve-veci"
  | "refiera-una-vez"
  | "compre-3-veces"
  | "apure-veci";

export type Business = {
  id: string;
  name: string;
  ownerName: string;
  location: Location;
  /** Optional neighborhood label shown on the user-facing modal. */
  barrio?: string;
};

export type Campaign = {
  id: string;
  businessId: string;
  /**
   * Denormalized business payload so the client has everything it needs
   * to render the modal without a follow-up request. Only the public
   * bits are exposed (never the owner's personal info beyond their
   * first name).
   */
  business: Pick<Business, "id" | "name" | "location" | "barrio"> & {
    ownerName: string;
  };
  type: CampaignType;
  title: string;
  description: string;
  /** Discount percent that headlines the push notification ("-10% OFF"). */
  discountPct: number;
  /** Budget the owner committed (USD). Only shown on the owner side. */
  investUSD: number;
  /** Estimated reach (people within radius). Shown in the launch success. */
  reachPeople: number;
  /** Broadcast radius in meters. Default 800 m when creating. */
  radiusM: number;
  /** ISO-8601 timestamps. */
  createdAt: string;
  expiresAt: string;
};

/** Request body for `POST /businesses`. If `id` is omitted a new one is
 *  minted; if provided and already exists the record is upserted. */
export type UpsertBusinessInput = {
  id?: string;
  name: string;
  ownerName: string;
  location: Location;
  barrio?: string;
};

/** Request body for `POST /campaigns`. */
export type CreateCampaignInput = {
  businessId: string;
  type: CampaignType;
  radiusM?: number;
  /** How long the campaign stays active, in minutes. Default 60. */
  durationMin?: number;
};

/**
 * Metadata derived server-side for each `CampaignType`. Living here (and
 * not in a DB) is intentional — these strings are the product copy and
 * change rarely; the client can safely trust them.
 */
export const CAMPAIGN_CATALOGUE: Record<
  CampaignType,
  Pick<Campaign, "title" | "description" | "discountPct" | "investUSD" | "reachPeople">
> = {
  "vuelve-veci": {
    title: "Vuelva Veci",
    description:
      "Descuento personalizado para que vuelvas a comprar en el barrio.",
    discountPct: 10,
    investUSD: 10,
    reachPeople: 50,
  },
  "refiera-una-vez": {
    title: "Refiera Una Vez",
    description: "Traé un amigo al local y los dos ganan descuento.",
    discountPct: 15,
    investUSD: 15,
    reachPeople: 80,
  },
  "compre-3-veces": {
    title: "Compre 3 Veces",
    description: "Tras tu tercera compra consecutiva se activa el descuento.",
    discountPct: 20,
    investUSD: 8,
    reachPeople: 35,
  },
  "apure-veci": {
    title: "Apure, Veci",
    description: "Productos por vencer con descuentos de último momento.",
    discountPct: 30,
    investUSD: 12,
    reachPeople: 60,
  },
};
