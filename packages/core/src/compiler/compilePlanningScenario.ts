import { Either, Schema } from "effect"
import { ArrayFormatter } from "effect/ParseResult"
import { compareIsoDate, eachDate, isSemanticIsoDate, isValidTimeZone, isWeekend } from "../domain/calendar"
import { canonicalHash } from "../domain/hash"
import type { IsoDate, WeekendBlockId } from "../domain/ids"
import type { DayDemand, Holiday, Provider, ScheduleScenario, WeekendBlock } from "../domain/scenario"
import { resolveSolverConfig } from "../domain/scenario"
import { expandDemand } from "../planning/demandExpansion"
import { selectOpeningLedger } from "../planning/openingLedger"
import { GenerationRequest, PlanningState } from "../planning/planningSchema"
import { validatePlanning } from "../planning/planningValidation"
import { expandUnavailableDates } from "../planning/unavailableDates"
import { summarizeDayEligibility } from "../validation/dayEligibility"
import { type CompileDiagnostic, compileError, compileWarning } from "./compileDiagnostics"

// Pure compiler from human planning state to a complete engine ScheduleScenario (spec "Scenario
// Compiler"). No database, file, solver, or network access. It validates, expands demand and
// unavailability, attaches holidays and weekend blocks, selects the opening ledger, and assembles the
// scenario. Generation is blocked when any diagnostic has severity "error". The engine remains the sole
// assignment authority — this only shapes its input.
export type CompilePlanningScenarioResult =
  | {
      status: "valid"
      scenario: ScheduleScenario
      scenario_hash: string
      diagnostics: CompileDiagnostic[]
    }
  | { status: "invalid_input"; diagnostics: CompileDiagnostic[] }

export function compilePlanningScenario(input: {
  state: unknown
  generation: unknown
}): CompilePlanningScenarioResult {
  const decodedState = Schema.decodeUnknownEither(PlanningState)(input.state, { onExcessProperty: "error" })
  const decodedGeneration = Schema.decodeUnknownEither(GenerationRequest)(input.generation, {
    onExcessProperty: "error",
  })
  const decodeDiagnostics: CompileDiagnostic[] = []
  let state: PlanningState | undefined
  let generation: GenerationRequest | undefined
  if (Either.isLeft(decodedState))
    decodeDiagnostics.push(...schemaDiagnostics("C_PLANNING_SCHEMA_INVALID", ["state"], decodedState.left))
  else state = decodedState.right
  if (Either.isLeft(decodedGeneration))
    decodeDiagnostics.push(
      ...schemaDiagnostics("C_GENERATION_SCHEMA_INVALID", ["generation"], decodedGeneration.left),
    )
  else generation = decodedGeneration.right
  if (decodeDiagnostics.length > 0) return { status: "invalid_input", diagnostics: decodeDiagnostics }
  if (state === undefined || generation === undefined)
    return {
      status: "invalid_input",
      diagnostics: [
        compileError("C_PLANNING_SCHEMA_INVALID", "Compiler input could not be decoded.", ["state"]),
      ],
    }
  const { horizon } = generation
  const initialDiagnostics = validateCompilerRequest(state, generation)
  if (initialDiagnostics.some((d) => d.severity === "error"))
    return { status: "invalid_input", diagnostics: initialDiagnostics }

  const horizonDates = eachDate(horizon.start_date, horizon.end_date)
  const horizonSet = new Set<IsoDate>(horizonDates)

  const diagnostics: CompileDiagnostic[] = [...initialDiagnostics, ...validatePlanning(state, horizon)]
  const demand = expandDemand({
    templates: state.demand_templates,
    exceptions: state.date_exceptions,
    horizon,
  })
  diagnostics.push(...demand.diagnostics)
  const ledger = selectOpeningLedger({
    openingLedger: state.opening_ledger,
    workspace: state.workspace,
    providers: state.providers,
    horizon,
  })
  diagnostics.push(...ledger.diagnostics)

  // In-horizon calendar facts. A weekend block is included only when all its dates lie inside the
  // horizon (straddling blocks already produced an error); holidays outside the horizon are irrelevant.
  const blocks = state.weekend_blocks.filter((b) => b.dates.every((d) => horizonSet.has(d)))
  const holidaysInHorizon = state.holidays.filter((h) => horizonSet.has(h.date))
  for (const h of state.holidays) {
    if (!horizonSet.has(h.date))
      diagnostics.push(
        compileWarning(
          "C_HOLIDAY_OUTSIDE_HORIZON",
          `Holiday ${h.holiday_id} for ${h.date} is outside the horizon and was ignored.`,
          ["holidays", h.holiday_id],
          { date: h.date },
        ),
      )
  }
  const holidayByDate = new Map(holidaysInHorizon.map((h) => [h.date, h]))
  const blockIdByDate = new Map<IsoDate, WeekendBlockId>()
  for (const b of blocks) for (const d of b.dates) blockIdByDate.set(d, b.weekend_block_id)

  const unavailable = expandUnavailableDates(state.unavailability, horizon)
  const horizonActiveProviders = state.providers.filter(
    (p) =>
      p.active_from <= horizon.end_date && (p.active_until === null || p.active_until >= horizon.start_date),
  )
  const providerAvailable = (provider: (typeof horizonActiveProviders)[number], date: IsoDate): boolean =>
    provider.active_from <= date &&
    (provider.active_until === null || date <= provider.active_until) &&
    !(unavailable.get(provider.provider_id) ?? []).includes(date)
  const eligibilityProviders: Provider[] = horizonActiveProviders.map((p) => ({
    id: p.provider_id,
    display_name: p.display_name,
    fte: p.fte,
    call_eligible: p.call_eligible,
    eye_eligible: p.eye_eligible,
    dental_eligible: p.dental_eligible,
    active_from: p.active_from,
    active_until: p.active_until,
    unavailable_dates: unavailable.get(p.provider_id) ?? [],
  }))
  const eligibilityBlocks: WeekendBlock[] = blocks.map((b) => ({
    id: b.weekend_block_id,
    dates: b.dates,
    split_required: b.split_required,
    required_distinct_call_providers: b.required_distinct_call_providers,
  }))

  // Eligibility-pool diagnostics, conditioned on the demand and date-specific availability.
  for (const date of horizonDates) {
    const facts = demand.demandByDate.get(date)
    if (facts === undefined) continue
    const day: DayDemand = {
      date,
      room_count: facts.room_count,
      normal_list_slots: facts.normal_list_slots,
      eye_slots: facts.eye_slots,
      dental_slots: facts.dental_slots,
      call_required: facts.call_required,
      holiday_id: holidayByDate.get(date)?.holiday_id ?? null,
      weekend_block_id: blockIdByDate.get(date) ?? null,
    }
    const summary = summarizeDayEligibility(day, eligibilityProviders, eligibilityBlocks)
    const totalSlots = facts.normal_list_slots + facts.eye_slots + facts.dental_slots
    const callEligibleHere = summary.call_eligible_available
    const needsCall = facts.call_required || isWeekend(date, blocks) || holidayByDate.has(date)
    const callRestrictedNeed = needsCall
      ? Math.max(1, summary.call_restricted_slots)
      : summary.call_restricted_slots
    if (callRestrictedNeed > 0 && callEligibleHere < callRestrictedNeed)
      diagnostics.push(
        compileError(
          "C_NO_CALL_ELIGIBLE_PROVIDERS",
          `${date} needs ${callRestrictedNeed} call-eligible provider(s), but only ${callEligibleHere} are active and available.`,
          ["providers"],
          { date },
        ),
      )
    if ((isWeekend(date, blocks) || holidayByDate.has(date)) && callEligibleHere < totalSlots)
      diagnostics.push(
        compileError(
          "C_NO_CALL_ELIGIBLE_PROVIDERS",
          `${date} is a weekend or holiday and needs ${totalSlots} call-eligible providers, but only ${callEligibleHere} are active and available.`,
          ["providers"],
          { date },
        ),
      )
    if (facts.eye_slots > 0 && summary.eye_eligible_available < facts.eye_slots)
      diagnostics.push(
        compileError(
          "C_NO_EYE_ELIGIBLE_PROVIDERS",
          `${date} has ${facts.eye_slots} eye slot(s), but only ${summary.eye_eligible_available} eligible provider(s) are active and available.`,
          ["providers"],
          { date },
        ),
      )
    if (facts.dental_slots > 0 && summary.dental_eligible_available < facts.dental_slots)
      diagnostics.push(
        compileError(
          "C_NO_DENTAL_ELIGIBLE_PROVIDERS",
          `${date} has ${facts.dental_slots} dental slot(s), but only ${summary.dental_eligible_available} eligible provider(s) are active and available.`,
          ["providers"],
          { date },
        ),
      )
    if (!summary.can_cover_all_slots)
      diagnostics.push(
        compileError(
          "C_INSUFFICIENT_ELIGIBLE_PROVIDERS",
          `${date} has no distinct eligible provider matching for its slots.`,
          ["providers"],
          { date },
        ),
      )
  }
  for (const block of blocks) {
    if (!block.split_required) continue
    const callDates = block.dates.filter((date) => {
      const facts = demand.demandByDate.get(date)
      return facts?.call_required === true && facts.normal_list_slots > 0
    })
    const availableCallProviders = horizonActiveProviders.filter(
      (p) => p.call_eligible && callDates.some((date) => providerAvailable(p, date)),
    )
    const distinctCallCapacity = Math.min(callDates.length, availableCallProviders.length)
    if (block.required_distinct_call_providers > distinctCallCapacity)
      diagnostics.push(
        compileError(
          "C_NO_CALL_ELIGIBLE_PROVIDERS",
          `Weekend block ${block.weekend_block_id} requires ${block.required_distinct_call_providers} distinct call providers, but only ${distinctCallCapacity} can cover call dates in the block.`,
          ["weekend_blocks", block.weekend_block_id],
        ),
      )
  }

  if (diagnostics.some((d) => d.severity === "error")) return { status: "invalid_input", diagnostics }

  const days: DayDemand[] = horizonDates.map((date) => {
    const f = demand.demandByDate.get(date)
    // justify-defect: no error diagnostics remain, so every horizon date resolved to exactly one demand.
    if (f === undefined) throw new Error(`compile invariant: no demand for ${date}`)
    return {
      date,
      room_count: f.room_count,
      normal_list_slots: f.normal_list_slots,
      eye_slots: f.eye_slots,
      dental_slots: f.dental_slots,
      call_required: f.call_required,
      holiday_id: holidayByDate.get(date)?.holiday_id ?? null,
      weekend_block_id: blockIdByDate.get(date) ?? null,
    }
  })

  const providers: Provider[] = horizonActiveProviders.map((p) => ({
    id: p.provider_id,
    display_name: p.display_name,
    fte: p.fte,
    call_eligible: p.call_eligible,
    eye_eligible: p.eye_eligible,
    dental_eligible: p.dental_eligible,
    active_from: p.active_from,
    active_until: p.active_until,
    unavailable_dates: unavailable.get(p.provider_id) ?? [],
  }))
  const holidays: Holiday[] = holidaysInHorizon.map((h) => ({
    id: h.holiday_id,
    date: h.date,
    label: h.label,
    class: h.class,
    weekend_block_id: h.weekend_block_id,
  }))
  const weekendBlocks: WeekendBlock[] = blocks.map((b) => ({
    id: b.weekend_block_id,
    dates: b.dates,
    split_required: b.split_required,
    required_distinct_call_providers: b.required_distinct_call_providers,
  }))
  const solver = resolveSolverConfig(generation.solver)

  const scenario: ScheduleScenario = {
    schema_version: "v0.1",
    scenario_id: `${state.workspace.workspace_id}:${horizon.start_date}..${horizon.end_date}`,
    horizon: {
      start_date: horizon.start_date,
      end_date: horizon.end_date,
      timezone: state.workspace.timezone,
    },
    providers,
    days,
    holidays,
    weekend_blocks: weekendBlocks,
    opening_ledger: ledger.rows,
    rules: {},
    weights: {},
    solver,
  }
  return { status: "valid", scenario, scenario_hash: canonicalHash(scenario), diagnostics }
}

function schemaDiagnostics(
  code: "C_PLANNING_SCHEMA_INVALID" | "C_GENERATION_SCHEMA_INVALID",
  path: string[],
  error: Parameters<typeof ArrayFormatter.formatErrorSync>[0],
): CompileDiagnostic[] {
  return ArrayFormatter.formatErrorSync(error).map((i) =>
    compileError(code, `${i.path.join(".") || "(root)"}: ${i.message}`, path),
  )
}

function validateCompilerRequest(state: PlanningState, generation: GenerationRequest): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = []
  const { horizon } = generation
  if (!isSemanticIsoDate(horizon.start_date))
    diagnostics.push(
      compileError("C_INVALID_HORIZON", `Invalid horizon start date ${horizon.start_date}.`, [
        "generation",
        "horizon",
        "start_date",
      ]),
    )
  if (!isSemanticIsoDate(horizon.end_date))
    diagnostics.push(
      compileError("C_INVALID_HORIZON", `Invalid horizon end date ${horizon.end_date}.`, [
        "generation",
        "horizon",
        "end_date",
      ]),
    )
  if (
    isSemanticIsoDate(horizon.start_date) &&
    isSemanticIsoDate(horizon.end_date) &&
    compareIsoDate(horizon.start_date, horizon.end_date) > 0
  )
    diagnostics.push(
      compileError(
        "C_INVALID_HORIZON",
        `Horizon start ${horizon.start_date} must be on or before end ${horizon.end_date}.`,
        ["generation", "horizon"],
      ),
    )
  if (!isValidTimeZone(state.workspace.timezone))
    diagnostics.push(
      compileError("C_INVALID_TIMEZONE", `Invalid timezone ${state.workspace.timezone}.`, [
        "workspace",
        "timezone",
      ]),
    )
  if (
    isSemanticIsoDate(horizon.start_date) &&
    isSemanticIsoDate(horizon.end_date) &&
    isSemanticIsoDate(state.workspace.active_cycle_start) &&
    isSemanticIsoDate(state.workspace.active_cycle_end) &&
    (horizon.start_date < state.workspace.active_cycle_start ||
      horizon.end_date > state.workspace.active_cycle_end)
  )
    diagnostics.push(
      compileError(
        "C_INVALID_HORIZON",
        `Horizon ${horizon.start_date}..${horizon.end_date} must stay within active cycle ${state.workspace.active_cycle_start}..${state.workspace.active_cycle_end}.`,
        ["generation", "horizon"],
      ),
    )
  return diagnostics
}
