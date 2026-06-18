import { Either, Schema } from "effect"
import { ArrayFormatter } from "effect/ParseResult"

// Decode untrusted scalar route/query values at the HTTP boundary. A malformed path/query value is a
// client error; a well-formed value that points at no stored resource remains a route-owned 404.
export function decodeValue<A, I>(
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
