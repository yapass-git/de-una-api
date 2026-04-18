import { businessStore } from "./store/memory.js";
import type { Business } from "./types.js";

/**
 * Seed La Vicentina (Quito, Ecuador). Coordinates picked from the
 * neighborhood's commercial corridor so demos land near real shops.
 * The owner is Martha — the archetypal user from the product brief.
 */
export const SEED_BUSINESS_ID = "biz-martha-la-vicentina";

export function runSeed(): void {
  const martha: Business = {
    id: SEED_BUSINESS_ID,
    name: "Frutería Martha Kiting",
    ownerName: "Martha",
    location: { lat: -0.2082, lng: -78.4882 },
    barrio: "La Vicentina",
  };
  businessStore.upsert(martha);
}
