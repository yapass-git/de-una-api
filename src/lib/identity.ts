import { createHash } from "node:crypto";

/**
 * Deterministic "who is this visitor" helper used by `GET /me`.
 *
 * The YaPass client never asks a user to register; instead, every IP
 * that hits the API gets pinned to a stable display name so the UI can
 * render a personalised greeting without a real auth layer. Since the
 * mapping is derived purely from a SHA-1 of the IP, two visits from
 * the same network return the same name without any persistence on
 * disk — a Map cache only exists to avoid recomputing the hash per
 * request.
 *
 * This is *not* PII-safe auth: it's an MVP convenience. Anyone on the
 * same NAT'd IP shares a name, and spoofing `X-Forwarded-For` would
 * change it. That's acceptable for a demo wallet.
 */

/**
 * Small first-name pool sized to give ~30 variants; trimmed to names
 * that read well in Spanish without accents so they render cleanly in
 * avatars and initials everywhere. Keep it diverse enough that two
 * nearby testers don't collide too often, but short enough to audit.
 */
const FIRST_NAMES = [
  "Samira",
  "Mateo",
  "Lucia",
  "Diego",
  "Paula",
  "Valentina",
  "Sebastian",
  "Camila",
  "Tomas",
  "Emilia",
  "Joaquin",
  "Isabela",
  "Martin",
  "Renata",
  "Nicolas",
  "Antonia",
  "Ignacio",
  "Daniela",
  "Andres",
  "Sofia",
  "Maximiliano",
  "Regina",
  "Benjamin",
  "Florencia",
  "Gabriel",
  "Catalina",
  "Julian",
  "Mariana",
  "Felipe",
  "Victoria",
] as const;

/**
 * Last-name initial is appended to the display to disambiguate when
 * two different IPs hash to the same first name.
 */
const LAST_INITIALS = [
  "A.",
  "B.",
  "C.",
  "D.",
  "F.",
  "G.",
  "H.",
  "L.",
  "M.",
  "N.",
  "P.",
  "R.",
  "S.",
  "T.",
  "V.",
] as const;

export type Identity = {
  id: string;
  name: string;
  initials: string;
};

const cache = new Map<string, Identity>();

/**
 * Produce a stable {@link Identity} for the given raw IP string.
 *
 * Empty / unknown IPs fall back to an anonymous "Amigx" identity so
 * the UI still has something to render when the request came through
 * a proxy that stripped the address.
 */
export function identityForIp(ip: string | null | undefined): Identity {
  const key = (ip ?? "").trim() || "unknown";

  const cached = cache.get(key);
  if (cached) return cached;

  if (key === "unknown") {
    const fallback: Identity = {
      id: "anon",
      name: "Amigx",
      initials: "A·",
    };
    cache.set(key, fallback);
    return fallback;
  }

  // Split the hash into two 32-bit integers: one picks the first name,
  // the other the last-name initial. SHA-1 is overkill cryptographically
  // but is in the stdlib, cheap, and gives a nice even distribution.
  const hash = createHash("sha1").update(key).digest("hex");
  const firstIdx = parseInt(hash.slice(0, 8), 16) % FIRST_NAMES.length;
  const lastIdx = parseInt(hash.slice(8, 16), 16) % LAST_INITIALS.length;

  const name = FIRST_NAMES[firstIdx];
  const lastInitial = LAST_INITIALS[lastIdx];

  const identity: Identity = {
    id: `guest-${hash.slice(0, 12)}`,
    name,
    initials: `${name[0]}${lastInitial[0]}`.toUpperCase(),
  };

  cache.set(key, identity);
  return identity;
}
