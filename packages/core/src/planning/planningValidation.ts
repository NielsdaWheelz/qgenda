import { type CompileDiagnostic, compileError, compileWarning } from "../compiler/compileDiagnostics"
import { compareIsoDate, eachDate, isSemanticIsoDate, isValidTimeZone } from "../domain/calendar"
import type { IsoDate } from "../domain/ids"
import type { PlanningState } from "./planningSchema"

// Cross-entity planning checks the per-entity schema cannot express (spec "Compile Diagnostics"). Owns
// provider identity and reference integrity, provider/horizon activity, unavailability vs active range,
// weekend-block horizon coverage, and holiday -> weekend-block references. Demand coverage, capacity,
// opening-ledger, and eligibility-pool diagnostics are owned by their own compiler steps.
export function validatePlanning(
  state: PlanningState,
  horizon: { start_date: IsoDate; end_date: IsoDate },
): CompileDiagnostic[] {
  const { providers, unavailability, weekend_blocks } = state
  const diagnostics: CompileDiagnostic[] = [...validatePlanningState(state)]
  const horizonSet = new Set<IsoDate>(eachDate(horizon.start_date, horizon.end_date))
  const intersectsHorizon = (from: IsoDate, until: IsoDate | null) =>
    from <= horizon.end_date && (until === null || until >= horizon.start_date)

  for (const p of providers) {
    if (!intersectsHorizon(p.active_from, p.active_until))
      diagnostics.push(
        compileWarning(
          "C_PROVIDER_INACTIVE_IN_HORIZON",
          `Provider ${p.provider_id} is not active during the horizon and will not be scheduled.`,
          ["providers", p.provider_id],
        ),
      )
  }

  const providerById = new Map(providers.map((p) => [p.provider_id, p]))
  for (const u of unavailability) {
    const provider = providerById.get(u.provider_id)
    if (provider === undefined) {
      continue
    }
    if (
      u.start_date < provider.active_from ||
      (provider.active_until !== null && u.end_date > provider.active_until)
    )
      diagnostics.push(
        compileWarning(
          "C_UNAVAILABILITY_OUTSIDE_ACTIVE_DATES",
          `Unavailability ${u.unavailability_id} extends outside provider ${u.provider_id}'s active dates.`,
          ["unavailability", u.unavailability_id],
        ),
      )
  }

  // A weekend block straddling the horizon boundary is ambiguous; require all of its dates inside (or
  // all outside, in which case the compiler drops it). Holidays must reference an existing block.
  for (const b of weekend_blocks) {
    const inside = b.dates.filter((d) => horizonSet.has(d)).length
    if (inside > 0 && inside < b.dates.length)
      diagnostics.push(
        compileError(
          "C_WEEKEND_BLOCK_DATE_OUTSIDE_HORIZON",
          `Weekend block ${b.weekend_block_id} straddles the horizon boundary; all of its dates must be inside the horizon.`,
          ["weekend_blocks", b.weekend_block_id],
        ),
      )
  }
  return diagnostics
}

export function validatePlanningState(state: PlanningState): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = []
  const {
    workspace,
    providers,
    unavailability,
    holidays,
    weekend_blocks,
    demand_templates,
    date_exceptions,
    opening_ledger,
  } = state

  if (!isValidTimeZone(workspace.timezone))
    diagnostics.push(
      compileError("C_INVALID_TIMEZONE", `Invalid timezone ${workspace.timezone}.`, [
        "workspace",
        "timezone",
      ]),
    )
  diagnostics.push(
    ...semanticDates([
      ["workspace", "active_cycle_start", workspace.active_cycle_start],
      ["workspace", "active_cycle_end", workspace.active_cycle_end],
    ]),
  )
  if (compareIsoDate(workspace.active_cycle_start, workspace.active_cycle_end) > 0)
    diagnostics.push(
      compileError(
        "C_INVALID_DATE_RANGE",
        "Workspace active_cycle_start must be on or before active_cycle_end.",
        ["workspace"],
      ),
    )

  diagnostics.push(
    ...duplicates(
      providers.map((p) => p.provider_id),
      "C_DUPLICATE_PROVIDER_ID",
      "providers",
    ),
  )
  diagnostics.push(
    ...duplicates(
      unavailability.map((u) => u.unavailability_id),
      "C_DUPLICATE_UNAVAILABILITY_ID",
      "unavailability",
    ),
  )
  diagnostics.push(
    ...duplicates(
      demand_templates.map((t) => t.template_id),
      "C_DUPLICATE_TEMPLATE_ID",
      "demand_templates",
    ),
  )
  diagnostics.push(
    ...duplicates(
      date_exceptions.map((e) => e.exception_id),
      "C_DUPLICATE_EXCEPTION_ID",
      "date_exceptions",
    ),
  )
  diagnostics.push(
    ...duplicates(
      holidays.map((h) => h.holiday_id),
      "C_DUPLICATE_HOLIDAY_ID",
      "holidays",
    ),
  )
  diagnostics.push(
    ...duplicates(
      weekend_blocks.map((b) => b.weekend_block_id),
      "C_DUPLICATE_WEEKEND_BLOCK_ID",
      "weekend_blocks",
    ),
  )
  diagnostics.push(
    ...duplicates(
      opening_ledger.map((l) => `${l.provider_id}:${l.cycle_start}`),
      "C_DUPLICATE_OPENING_LEDGER_PROVIDER",
      "opening_ledger",
    ),
  )

  for (const p of providers) {
    diagnostics.push(
      ...semanticDates([
        ["providers", p.provider_id, "active_from", p.active_from],
        ...(p.active_until === null
          ? []
          : ([["providers", p.provider_id, "active_until", p.active_until]] as const)),
      ]),
    )
    if (p.active_until !== null && compareIsoDate(p.active_from, p.active_until) > 0)
      diagnostics.push(
        compileError(
          "C_INVALID_DATE_RANGE",
          `Provider ${p.provider_id} active_from must be on or before active_until.`,
          ["providers", p.provider_id],
        ),
      )
  }

  const providerById = new Map(providers.map((p) => [p.provider_id, p]))
  for (const u of unavailability) {
    diagnostics.push(
      ...semanticDates([
        ["unavailability", u.unavailability_id, "start_date", u.start_date],
        ["unavailability", u.unavailability_id, "end_date", u.end_date],
      ]),
    )
    if (!providerById.has(u.provider_id))
      diagnostics.push(
        compileError(
          "C_UNKNOWN_PROVIDER_REFERENCE",
          `Unavailability ${u.unavailability_id} references unknown provider ${u.provider_id}.`,
          ["unavailability", u.unavailability_id],
        ),
      )
    if (compareIsoDate(u.start_date, u.end_date) > 0)
      diagnostics.push(
        compileError(
          "C_INVALID_DATE_RANGE",
          `Unavailability ${u.unavailability_id} start_date must be on or before end_date.`,
          ["unavailability", u.unavailability_id],
        ),
      )
  }

  for (const t of demand_templates) {
    diagnostics.push(
      ...semanticDates([
        ["demand_templates", t.template_id, "active_from", t.active_from],
        ...(t.active_until === null
          ? []
          : ([["demand_templates", t.template_id, "active_until", t.active_until]] as const)),
      ]),
    )
    if (t.active_until !== null && compareIsoDate(t.active_from, t.active_until) > 0)
      diagnostics.push(
        compileError(
          "C_INVALID_DATE_RANGE",
          `Demand template ${t.template_id} active_from must be on or before active_until.`,
          ["demand_templates", t.template_id],
        ),
      )
  }

  for (const e of date_exceptions)
    diagnostics.push(...semanticDates([["date_exceptions", e.exception_id, "date", e.date]]))

  const dateToBlock = new Map<IsoDate, string>()
  for (const b of weekend_blocks) {
    diagnostics.push(
      ...duplicates(b.dates, "C_DUPLICATE_WEEKEND_BLOCK_DATE", "weekend_blocks", b.weekend_block_id),
    )
    for (const date of b.dates) {
      diagnostics.push(...semanticDates([["weekend_blocks", b.weekend_block_id, "dates", date]]))
      const existing = dateToBlock.get(date)
      if (existing !== undefined && existing !== b.weekend_block_id)
        diagnostics.push(
          compileError(
            "C_DUPLICATE_WEEKEND_BLOCK_DATE",
            `Weekend block date ${date} appears in both ${existing} and ${b.weekend_block_id}.`,
            ["weekend_blocks", b.weekend_block_id],
            { date },
          ),
        )
      dateToBlock.set(date, b.weekend_block_id)
    }
  }

  const blockIds = new Set(weekend_blocks.map((b) => b.weekend_block_id))
  const blockById = new Map(weekend_blocks.map((b) => [b.weekend_block_id, b]))
  for (const h of holidays) {
    diagnostics.push(...semanticDates([["holidays", h.holiday_id, "date", h.date]]))
    if (h.weekend_block_id !== null && !blockIds.has(h.weekend_block_id))
      diagnostics.push(
        compileError(
          "C_WEEKEND_BLOCK_UNKNOWN_HOLIDAY",
          `Holiday ${h.holiday_id} references unknown weekend block ${h.weekend_block_id}.`,
          ["holidays", h.holiday_id],
        ),
      )
    const block = h.weekend_block_id === null ? undefined : blockById.get(h.weekend_block_id)
    if (block !== undefined && !block.dates.includes(h.date))
      diagnostics.push(
        compileError(
          "C_WEEKEND_BLOCK_DATE_MISMATCH",
          `Holiday ${h.holiday_id} date ${h.date} is not in weekend block ${block.weekend_block_id}.`,
          ["holidays", h.holiday_id],
          { date: h.date },
        ),
      )
  }
  for (const l of opening_ledger)
    diagnostics.push(
      ...semanticDates([
        ["opening_ledger", l.provider_id, "cycle_start", l.cycle_start],
        ["opening_ledger", l.provider_id, "as_of_date", l.as_of_date],
      ]),
    )
  return diagnostics
}

function duplicates(
  values: readonly string[],
  code:
    | "C_DUPLICATE_PROVIDER_ID"
    | "C_DUPLICATE_UNAVAILABILITY_ID"
    | "C_DUPLICATE_TEMPLATE_ID"
    | "C_DUPLICATE_EXCEPTION_ID"
    | "C_DUPLICATE_HOLIDAY_ID"
    | "C_DUPLICATE_WEEKEND_BLOCK_ID"
    | "C_DUPLICATE_WEEKEND_BLOCK_DATE"
    | "C_DUPLICATE_OPENING_LEDGER_PROVIDER",
  path: string,
  parent?: string,
): CompileDiagnostic[] {
  const seen = new Set<string>()
  const diagnostics: CompileDiagnostic[] = []
  for (const value of values) {
    if (seen.has(value))
      diagnostics.push(
        compileError(
          code,
          parent === undefined ? `Duplicate id ${value}.` : `Duplicate value ${value} in ${parent}.`,
          parent === undefined ? [path, value] : [path, parent],
        ),
      )
    seen.add(value)
  }
  return diagnostics
}

function semanticDates(entries: readonly (readonly [...string[], IsoDate])[]): CompileDiagnostic[] {
  return entries.flatMap((entry) => {
    const date = entry[entry.length - 1] as IsoDate
    if (isSemanticIsoDate(date)) return []
    const path = entry.slice(0, -1) as string[]
    return [compileError("C_INVALID_DATE", `Invalid date ${date}.`, path)]
  })
}
