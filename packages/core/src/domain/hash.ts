import { createHash } from "node:crypto"

// One owner for the canonical scenario hash, used by the engine result, the compile preview, and run
// snapshots. sha256 over the value with object keys sorted at every level, so logically equal values
// hash equally regardless of key order.
export function canonicalHash(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, v) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  )
  return `sha256:${createHash("sha256")
    .update(canonical ?? "")
    .digest("hex")}`
}
