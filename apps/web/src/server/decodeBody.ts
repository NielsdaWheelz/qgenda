import { Either, Schema } from "effect"
import { ArrayFormatter } from "effect/ParseResult"

// Decode an untrusted request body into an owned typed value at the HTTP boundary, rejecting unknown
// fields. Returns flat, path-qualified messages on failure so route handlers can return a 400 directly.
export function decodeBody<A, I>(
  schema: Schema.Schema<A, I>,
  raw: unknown,
): { ok: true; value: A } | { ok: false; errors: string[] } {
  const decoded = Schema.decodeUnknownEither(schema)(raw, { onExcessProperty: "error" })
  if (Either.isRight(decoded)) return { ok: true, value: decoded.right }
  return {
    ok: false,
    errors: ArrayFormatter.formatErrorSync(decoded.left).map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    ),
  }
}
