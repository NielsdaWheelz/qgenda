import { Schema } from "effect"

// Persisted JSON is same-system data, but hard-cutover storage must not silently accept stale or
// expanded shapes. Decode strictly at the repository boundary so incompatible rows fail loudly.
export function strictDecode<A, I>(schema: Schema.Schema<A, I>, value: unknown): A {
  return Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" })
}
