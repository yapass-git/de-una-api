import { randomUUID } from "node:crypto";

/**
 * Tiny wrapper so call sites don't need to import `node:crypto`
 * directly — makes it trivial to swap for a shorter id scheme later
 * (nanoid, ulid) if we ever expose ids in URLs.
 */
export function newId(): string {
  return randomUUID();
}
