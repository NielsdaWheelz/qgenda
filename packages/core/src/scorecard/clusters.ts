import { eachDate, weekendPeriods } from "../domain/calendar"
import type { IsoDate, ProviderId } from "../domain/ids"
import type { ScheduleScenario } from "../domain/scenario"
import type { Assignment, Scorecard } from "../domain/schedule"

// Owner of cluster/spacing metrics (spec "Cluster Metrics"). Works purely from the assignment list
// and the calendar horizon order; the solver's variables are never consulted.

// Longest run plus the descending run-length distribution over a set of indices into an ordered
// sequence (horizon dates, or weekend blocks). Indices need not be sorted.
function runs(indices: number[]): { max: number; distribution: number[] } {
  const sorted = [...indices].sort((a, b) => a - b)
  const lengths: number[] = []
  let len = 0
  let prev = Number.NaN
  for (const i of sorted) {
    len = i === prev + 1 ? len + 1 : 1
    if (len === 1) lengths.push(0)
    lengths[lengths.length - 1] = len
    prev = i
  }
  lengths.sort((a, b) => b - a)
  return { max: lengths[0] ?? 0, distribution: lengths }
}

export function clusterMetrics(
  scenario: ScheduleScenario,
  _slots: unknown,
  assignments: readonly Assignment[],
): Scorecard["clusters"] {
  const { providers, horizon, weekend_blocks } = scenario
  const horizonDates = eachDate(horizon.start_date, horizon.end_date)
  const dayIndex = new Map<IsoDate, number>(horizonDates.map((d, i) => [d, i]))
  // Configured blocks plus synthetic Saturday/Sunday periods, then each period date mapped to its ordinal.
  const orderedBlocks = weekendPeriods(horizon, weekend_blocks)
  const blockIndex = new Map<IsoDate, number>()
  orderedBlocks.forEach((b, i) => {
    for (const d of b.dates) blockIndex.set(d, i)
  })

  // Per provider: the horizon-date ordinals worked, the ordinals with derived call, and the
  // weekend-block ordinals touched.
  const worked = new Map<ProviderId, Set<number>>(providers.map((p) => [p.id, new Set()]))
  const callDays = new Map<ProviderId, Set<number>>(providers.map((p) => [p.id, new Set()]))
  const blocks = new Map<ProviderId, Set<number>>(providers.map((p) => [p.id, new Set()]))
  for (const a of assignments) {
    // justify-defect: every assignment date is a horizon day (postsolve guarantees this).
    const di = dayIndex.get(a.date)
    if (di === undefined) throw new Error(`assignment on non-horizon date ${a.date}`)
    worked.get(a.provider_id)?.add(di)
    if (a.derived_call) callDays.get(a.provider_id)?.add(di)
    const bi = blockIndex.get(a.date)
    if (bi !== undefined) blocks.get(a.provider_id)?.add(bi)
  }

  let consecutive_call_violations = 0
  let post_call_violations = 0
  for (const p of providers) {
    const c = callDays.get(p.id) ?? new Set()
    const w = worked.get(p.id) ?? new Set()
    for (const d of c) {
      if (c.has(d + 1)) consecutive_call_violations++
      if (w.has(d + 1)) post_call_violations++
    }
  }

  const providerRows = providers.map((p) => {
    const workIdx = [...(worked.get(p.id) ?? new Set<number>())]
    const blockIdx = [...(blocks.get(p.id) ?? new Set<number>())]
    const callIdx = [...(callDays.get(p.id) ?? new Set<number>())].sort((a, b) => a - b)
    const work = runs(workIdx)
    const gaps: number[] = []
    let prevCall: number | undefined
    for (const d of callIdx) {
      if (prevCall !== undefined) gaps.push(d - prevCall)
      prevCall = d
    }
    return {
      provider_id: p.id,
      max_consecutive_workdays: work.max,
      workday_run_distribution: work.distribution,
      weekend_blocks_assigned: blockIdx.length,
      consecutive_weekend_blocks: runs(blockIdx).max,
      call_spacing_min: gaps.length > 0 ? Math.min(...gaps) : null,
      call_spacing_avg: gaps.length > 0 ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null,
    }
  })

  return { consecutive_call_violations, post_call_violations, providers: providerRows }
}
