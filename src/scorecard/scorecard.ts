import type { Slot } from "../domain/calendar"
import { eachDate, weekendPeriods } from "../domain/calendar"
import type { IsoDate, ProviderId } from "../domain/ids"
import type { Provider, ScheduleScenario, Weights } from "../domain/scenario"
import type { Assignment, FairnessTargets, LedgerRow, ProviderTargets, Scorecard } from "../domain/schedule"
import type { SoftRuleId } from "../rules/catalog"
import { clusterMetrics } from "./clusters"
import { ledgerRows } from "./ledger"

// Assembles the full scorecard from the fairness ledger, cluster metrics, and an independent
// recomputation of the soft-objective contributions. Reuses the ledger rows so per-provider burdens
// and counts are computed once.

// Max/min/spread/variance (population) over a ledger pool's values. Used for every aggregate.
function stat(values: number[]): { max: number; min: number; spread: number; variance: number } {
  if (values.length === 0) return { max: 0, min: 0, spread: 0, variance: 0 }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return { max, min, spread: max - min, variance }
}

export function buildScorecard(
  scenario: ScheduleScenario,
  slots: readonly Slot[],
  weights: Weights,
  targets: FairnessTargets,
  assignments: readonly Assignment[],
): Scorecard {
  const { providers } = scenario
  const rows = ledgerRows(scenario, slots, weights, targets, assignments)
  const providerById = new Map<ProviderId, Provider>(providers.map((p) => [p.id, p]))

  // Pool membership (spec "Fairness pools"): call positions → call-eligible, middle → all,
  // eye/dental → skill-eligible. Aggregates and balance terms filter their pool by row.
  const callPool = (r: LedgerRow): boolean => providerById.get(r.provider_id)?.call_eligible ?? false
  const eyePool = (r: LedgerRow): boolean => providerById.get(r.provider_id)?.eye_eligible ?? false
  const dentalPool = (r: LedgerRow): boolean => providerById.get(r.provider_id)?.dental_eligible ?? false

  const aggregates = {
    call_burden: stat(rows.filter(callPool).map((r) => r.call_burden)),
    weekend_burden: stat(rows.filter(callPool).map((r) => r.weekend_burden)),
    holiday_burden: stat(rows.filter(callPool).map((r) => r.holiday_burden)),
    first_count: stat(rows.filter(callPool).map((r) => r.first_count)),
    second_count: stat(rows.filter(callPool).map((r) => r.second_count)),
    middle_count: stat(rows.map((r) => r.middle_count)),
    last_count: stat(rows.filter(callPool).map((r) => r.last_count)),
    eye_count: stat(rows.filter(eyePool).map((r) => r.eye_count)),
    dental_count: stat(rows.filter(dentalPool).map((r) => r.dental_count)),
    workday_count: stat(rows.map((r) => r.workday_count)),
  }

  const callDeltas = rows.filter(callPool).map((r) => r.call_delta)

  // Σ |value − target| over a pool; the target field mirrors the ledger value's field.
  const balance = (
    pool: (r: LedgerRow) => boolean,
    value: (r: LedgerRow) => number,
    key: keyof ProviderTargets,
    weight = 1,
  ): number =>
    rows
      .filter(pool)
      .reduce((sum, r) => sum + weight * Math.abs(value(r) - (targets.get(r.provider_id)?.[key] ?? 0)), 0)

  const objective_contributions = {
    S_BALANCE_CALL_BURDEN: balance(callPool, (r) => r.call_burden, "call"),
    S_BALANCE_WEEKEND_BURDEN: balance(callPool, (r) => r.weekend_burden, "weekend"),
    S_BALANCE_HOLIDAY_BURDEN: balance(callPool, (r) => r.holiday_burden, "holiday"),
    S_BALANCE_FIRST_COUNT: balance(callPool, (r) => r.first_count, "first", weights.first_position),
    S_BALANCE_SECOND_COUNT: balance(callPool, (r) => r.second_count, "second", weights.second_position),
    S_BALANCE_MIDDLE_COUNT: balance(
      () => true,
      (r) => r.middle_count,
      "middle",
      weights.middle_position,
    ),
    S_BALANCE_LAST_COUNT: balance(callPool, (r) => r.last_count, "last", weights.last_position),
    S_BALANCE_EYE_COUNT: balance(eyePool, (r) => r.eye_count, "eye", weights.eye_slot),
    S_BALANCE_DENTAL_COUNT: balance(dentalPool, (r) => r.dental_count, "dental", weights.dental_slot),
    S_BALANCE_WORKDAY_COUNT: balance(
      () => true,
      (r) => r.workday_count,
      "workday",
    ),
    S_AVOID_WORK_CLUSTERS: adjacentPairs(scenario, assignments, "workday"),
    S_AVOID_WEEKEND_CLUSTERS: adjacentPairs(scenario, assignments, "weekend"),
  } satisfies Record<SoftRuleId, number>

  const excluded = (keep: (p: Provider) => boolean): ProviderId[] =>
    providers.filter((p) => !keep(p)).map((p) => p.id)
  return {
    providers: rows,
    aggregates,
    largest_positive_delta: callDeltas.length > 0 ? Math.max(...callDeltas) : 0,
    largest_negative_delta: callDeltas.length > 0 ? Math.min(...callDeltas) : 0,
    excluded_pools: {
      call: excluded((p) => p.call_eligible),
      eye: excluded((p) => p.eye_eligible),
      dental: excluded((p) => p.dental_eligible),
    },
    clusters: clusterMetrics(scenario, slots, assignments),
    objective_contributions,
  }
}

// Scorecard for a result with no schedule (invalid_input, infeasible, solver_error).
export function emptyScorecard(): Scorecard {
  const zero = stat([])
  return {
    providers: [],
    aggregates: {
      call_burden: zero,
      weekend_burden: zero,
      holiday_burden: zero,
      first_count: zero,
      second_count: zero,
      middle_count: zero,
      last_count: zero,
      eye_count: zero,
      dental_count: zero,
      workday_count: zero,
    },
    largest_positive_delta: 0,
    largest_negative_delta: 0,
    excluded_pools: { call: [], eye: [], dental: [] },
    clusters: { consecutive_call_violations: 0, post_call_violations: 0, providers: [] },
    objective_contributions: {
      S_BALANCE_CALL_BURDEN: 0,
      S_BALANCE_WEEKEND_BURDEN: 0,
      S_BALANCE_HOLIDAY_BURDEN: 0,
      S_BALANCE_FIRST_COUNT: 0,
      S_BALANCE_SECOND_COUNT: 0,
      S_BALANCE_MIDDLE_COUNT: 0,
      S_BALANCE_LAST_COUNT: 0,
      S_BALANCE_EYE_COUNT: 0,
      S_BALANCE_DENTAL_COUNT: 0,
      S_BALANCE_WORKDAY_COUNT: 0,
      S_AVOID_WORK_CLUSTERS: 0,
      S_AVOID_WEEKEND_CLUSTERS: 0,
    },
  }
}

// Total over providers of adjacent-pair clusters: "workday" counts horizon dates worked back-to-back;
// "weekend" counts weekend blocks (ordered by earliest date) assigned back-to-back. Same shape, so
// one pass over the chosen ordinal sequence per mode.
function adjacentPairs(
  scenario: ScheduleScenario,
  assignments: readonly Assignment[],
  mode: "workday" | "weekend",
): number {
  const { providers, horizon, weekend_blocks } = scenario
  const ordinalOf = new Map<IsoDate, number>()
  if (mode === "workday") {
    eachDate(horizon.start_date, horizon.end_date).forEach((d, i) => {
      ordinalOf.set(d, i)
    })
  } else {
    const ordered = weekendPeriods(horizon, weekend_blocks)
    ordered.forEach((b, i) => {
      for (const d of b.dates) ordinalOf.set(d, i)
    })
  }
  const touched = new Map<ProviderId, Set<number>>(providers.map((p) => [p.id, new Set()]))
  for (const a of assignments) {
    const ord = ordinalOf.get(a.date)
    if (ord !== undefined) touched.get(a.provider_id)?.add(ord)
  }
  let pairs = 0
  for (const set of touched.values()) for (const ord of set) if (set.has(ord + 1)) pairs++
  return pairs
}
