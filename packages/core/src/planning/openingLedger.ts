import { type CompileDiagnostic, compileError } from "../compiler/compileDiagnostics"
import type { IsoDate } from "../domain/ids"
import type { OpeningLedger } from "../domain/scenario"
import type { OpeningLedgerPlan, PlanningWorkspace, ProviderPlan } from "./planningSchema"

// Select the opening-ledger rows for the active fairness cycle and map them to the engine's
// OpeningLedger shape (spec "Opening Ledger"). Rows for a different cycle_start are not part of this
// cycle and are ignored; rows for an unknown provider are an error. The cycle_start/as_of_date
// selection keys are planning-only and do not cross into the engine scenario.
export function selectOpeningLedger(input: {
  openingLedger: readonly OpeningLedgerPlan[]
  workspace: PlanningWorkspace
  providers: readonly ProviderPlan[]
  horizon: { start_date: IsoDate; end_date: IsoDate }
}): { rows: OpeningLedger[]; diagnostics: CompileDiagnostic[] } {
  const { openingLedger, workspace, providers, horizon } = input
  const diagnostics: CompileDiagnostic[] = []
  const known = new Set(providers.map((p) => p.provider_id))
  const rows: OpeningLedger[] = []
  const horizonActiveProviders = providers.filter(
    (p) =>
      p.active_from <= horizon.end_date && (p.active_until === null || p.active_until >= horizon.start_date),
  )
  const horizonActiveProviderIds = new Set(horizonActiveProviders.map((p) => p.provider_id))
  const seenActiveCycleRows = new Set<string>()
  for (const l of openingLedger) {
    if (l.cycle_start !== workspace.active_cycle_start) continue
    if (!known.has(l.provider_id)) {
      diagnostics.push(
        compileError(
          "C_OPENING_LEDGER_UNKNOWN_PROVIDER",
          `Opening ledger references unknown provider ${l.provider_id}.`,
          ["opening_ledger", l.provider_id],
        ),
      )
      continue
    }
    if (l.as_of_date < workspace.active_cycle_start || l.as_of_date > horizon.start_date) {
      diagnostics.push(
        compileError(
          "C_OPENING_LEDGER_AS_OF_OUTSIDE_HORIZON",
          `Opening ledger row for ${l.provider_id} has as_of_date ${l.as_of_date}; it must be between cycle start ${workspace.active_cycle_start} and horizon start ${horizon.start_date}.`,
          ["opening_ledger", l.provider_id],
          { date: l.as_of_date },
        ),
      )
      continue
    }
    if (seenActiveCycleRows.has(l.provider_id)) {
      diagnostics.push(
        compileError(
          "C_DUPLICATE_OPENING_LEDGER_PROVIDER",
          `Opening ledger has more than one active-cycle row for ${l.provider_id}.`,
          ["opening_ledger", l.provider_id],
        ),
      )
      continue
    }
    seenActiveCycleRows.add(l.provider_id)
    if (!horizonActiveProviderIds.has(l.provider_id)) continue
    rows.push({
      provider_id: l.provider_id,
      call_burden: l.call_burden,
      weekend_burden: l.weekend_burden,
      holiday_burden: l.holiday_burden,
      first_count: l.first_count,
      second_count: l.second_count,
      middle_count: l.middle_count,
      last_count: l.last_count,
      eye_count: l.eye_count,
      dental_count: l.dental_count,
    })
  }
  if (!workspace.opening_ledger_start_fresh) {
    const missing = horizonActiveProviders.filter((p) => !seenActiveCycleRows.has(p.provider_id))
    if (missing.length > 0)
      diagnostics.push(
        compileError(
          "C_OPENING_LEDGER_START_FRESH_REQUIRED",
          `Opening ledger is missing active-cycle rows for ${missing.map((p) => p.provider_id).join(", ")}. Add zero rows or confirm start fresh for the cycle.`,
          ["opening_ledger"],
        ),
      )
  }
  return { rows, diagnostics }
}
