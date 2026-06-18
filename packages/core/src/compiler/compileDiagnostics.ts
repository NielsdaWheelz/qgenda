import { Schema } from "effect"
import { IsoDate } from "../domain/ids"

// Stable diagnostic codes the compiler emits about a planning state (spec "Compile Diagnostics"). A
// diagnostic is a domain record, not a tagged union: `code` and `severity` are semantic fields. Generation
// is blocked when any diagnostic has severity "error"; warnings are advisory. Crosses the API boundary as
// JSON, so it is an Effect Schema.
export const CompileDiagnosticCode = Schema.Literal(
  "C_PLANNING_SCHEMA_INVALID",
  "C_GENERATION_SCHEMA_INVALID",
  "C_INVALID_HORIZON",
  "C_INVALID_DATE",
  "C_INVALID_TIMEZONE",
  "C_INVALID_DATE_RANGE",
  "C_DUPLICATE_PROVIDER_ID",
  "C_DUPLICATE_UNAVAILABILITY_ID",
  "C_DUPLICATE_TEMPLATE_ID",
  "C_DUPLICATE_EXCEPTION_ID",
  "C_DUPLICATE_HOLIDAY_ID",
  "C_DUPLICATE_WEEKEND_BLOCK_ID",
  "C_DUPLICATE_WEEKEND_BLOCK_DATE",
  "C_DUPLICATE_OPENING_LEDGER_PROVIDER",
  "C_UNKNOWN_PROVIDER_REFERENCE",
  "C_PROVIDER_INACTIVE_IN_HORIZON",
  "C_UNAVAILABILITY_OUTSIDE_ACTIVE_DATES",
  "C_MULTIPLE_DEMAND_TEMPLATES_FOR_DATE",
  "C_MISSING_DEMAND_FOR_DATE",
  "C_DATE_EXCEPTION_OUTSIDE_HORIZON",
  "C_DEMAND_EXCEEDS_ROOM_COUNT",
  "C_CALL_REQUIRES_NORMAL_SLOT",
  "C_HOLIDAY_OUTSIDE_HORIZON",
  "C_WEEKEND_BLOCK_DATE_OUTSIDE_HORIZON",
  "C_WEEKEND_BLOCK_DATE_MISMATCH",
  "C_WEEKEND_BLOCK_UNKNOWN_HOLIDAY",
  "C_OPENING_LEDGER_UNKNOWN_PROVIDER",
  "C_OPENING_LEDGER_START_FRESH_REQUIRED",
  "C_OPENING_LEDGER_AS_OF_OUTSIDE_HORIZON",
  "C_NO_CALL_ELIGIBLE_PROVIDERS",
  "C_NO_EYE_ELIGIBLE_PROVIDERS",
  "C_NO_DENTAL_ELIGIBLE_PROVIDERS",
  "C_INSUFFICIENT_ELIGIBLE_PROVIDERS",
)
export type CompileDiagnosticCode = typeof CompileDiagnosticCode.Type

export const CompileDiagnostic = Schema.Struct({
  code: CompileDiagnosticCode,
  severity: Schema.Literal("error", "warning"),
  message: Schema.String,
  path: Schema.Array(Schema.String),
  date: Schema.optional(IsoDate),
})
export type CompileDiagnostic = typeof CompileDiagnostic.Type

export function compileError(
  code: CompileDiagnosticCode,
  message: string,
  path: string[],
  extra: { date?: typeof IsoDate.Type } = {},
): CompileDiagnostic {
  return { code, severity: "error", message, path, ...extra }
}

export function compileWarning(
  code: CompileDiagnosticCode,
  message: string,
  path: string[],
  extra: { date?: typeof IsoDate.Type } = {},
): CompileDiagnostic {
  return { code, severity: "warning", message, path, ...extra }
}
