import { expect, test } from "bun:test"
import { Schema } from "effect"
import { expandDay } from "../src/domain/calendar"
import { ScheduleScenario } from "../src/domain/scenario"
import type { Assignment as AssignmentT } from "../src/domain/schedule"
import { Assignment } from "../src/domain/schedule"
import { SOFT_RULE_IDS } from "../src/rules/catalog"
import { DEFAULT_WEIGHTS } from "../src/rules/weights"
import { fairnessTargets, ledgerRows } from "../src/scorecard/ledger"
import { buildScorecard } from "../src/scorecard/scorecard"

// One hand-built four-day scenario (Wed–Sat) drives every assertion. Four providers: p1 (full call),
// p2 (half-FTE call), p4 (full call), p3 (non-call, eye-eligible). The assignment list below is
// hand-checked valid: no consecutive call (call lives on the first-equivalent slot of a call_required
// day) and no work the day after call. Targets, ledger rows, aggregates, clusters, and objective
// contributions are computed against this and compared to values worked out by hand.
const RAW = {
  schema_version: "v0.1",
  scenario_id: "scorecard-fixture",
  horizon: { start_date: "2026-06-17", end_date: "2026-06-20", timezone: "UTC" },
  providers: [
    {
      id: "p1",
      display_name: "P1",
      fte: 1,
      call_eligible: true,
      eye_eligible: false,
      dental_eligible: false,
      active_from: "2026-06-01",
      active_until: null,
    },
    {
      id: "p2",
      display_name: "P2",
      fte: 0.5,
      call_eligible: true,
      eye_eligible: false,
      dental_eligible: false,
      active_from: "2026-06-01",
      active_until: null,
    },
    {
      id: "p4",
      display_name: "P4",
      fte: 1,
      call_eligible: true,
      eye_eligible: false,
      dental_eligible: false,
      active_from: "2026-06-01",
      active_until: null,
    },
    {
      id: "p3",
      display_name: "P3",
      fte: 1,
      call_eligible: false,
      eye_eligible: true,
      dental_eligible: false,
      active_from: "2026-06-01",
      active_until: null,
    },
  ],
  days: [
    {
      date: "2026-06-17",
      room_count: 4,
      normal_list_slots: 4,
      eye_slots: 0,
      dental_slots: 0,
      call_required: true,
      holiday_id: null,
      weekend_block_id: null,
    },
    {
      date: "2026-06-18",
      room_count: 3,
      normal_list_slots: 2,
      eye_slots: 1,
      dental_slots: 0,
      call_required: true,
      holiday_id: null,
      weekend_block_id: null,
    },
    {
      date: "2026-06-19",
      room_count: 1,
      normal_list_slots: 1,
      eye_slots: 0,
      dental_slots: 0,
      call_required: true,
      holiday_id: null,
      weekend_block_id: null,
    },
    {
      date: "2026-06-20",
      room_count: 2,
      normal_list_slots: 2,
      eye_slots: 0,
      dental_slots: 0,
      call_required: true,
      holiday_id: null,
      weekend_block_id: null,
    },
  ],
}

const scenario = Schema.decodeUnknownSync(ScheduleScenario)(RAW, { onExcessProperty: "error" })
const slots = scenario.days.flatMap(expandDay)
const weights = DEFAULT_WEIGHTS

// Wed=weekday call 1.0, Thu=weekday 1.0, Fri=weekday 1.0 (no block), Sat=weekend 1.5.
const a = (
  date: string,
  slot_type: AssignmentT["slot_type"],
  provider_id: string,
  derived_call: boolean,
): AssignmentT =>
  Schema.decodeUnknownSync(Assignment)({
    date,
    slot_id: `${date}:${slot_type}`,
    slot_type,
    provider_id,
    derived_call,
    weekend: date === "2026-06-20",
    holiday_id: null,
  })
const assignments: AssignmentT[] = [
  a("2026-06-17", "normal_first", "p1", true),
  a("2026-06-17", "normal_second", "p2", false),
  a("2026-06-17", "normal_middle", "p3", false),
  a("2026-06-17", "normal_last", "p4", false),
  a("2026-06-18", "normal_first", "p2", true),
  a("2026-06-18", "normal_last", "p4", false),
  a("2026-06-18", "eye_middle", "p3", false),
  a("2026-06-19", "normal_first_last", "p1", true),
  a("2026-06-20", "normal_first", "p2", true),
  a("2026-06-20", "normal_last", "p4", false),
]

const targets = fairnessTargets(scenario, slots, weights)
const rows = ledgerRows(scenario, slots, weights, targets, assignments)
const rowOf = (id: string) => {
  const r = rows.find((x) => x.provider_id === id)
  if (r === undefined) throw new Error(`no ledger row for ${id}`)
  return r
}
const card = buildScorecard(scenario, slots, weights, targets, assignments)

// Look up a provider's targets by id, keying off the branded ids carried on the decoded scenario.
const callTargetOf = (id: string): number => {
  const p = scenario.providers.find((x) => x.id === id)
  return p === undefined ? Number.NaN : (targets.get(p.id)?.call ?? Number.NaN)
}

test("fairness targets split call burden by FTE share net of opening", () => {
  // Total call burden = 1.0 + 1.0 + 1.0 + 1.5 = 4.5 over FTE pool {p1:1, p2:0.5, p4:1} (sum 2.5).
  expect(callTargetOf("p1")).toBeCloseTo(1.8, 10) // 4.5 * 1/2.5
  expect(callTargetOf("p2")).toBeCloseTo(0.9, 10) // 4.5 * 0.5/2.5
  expect(callTargetOf("p4")).toBeCloseTo(1.8, 10)
  expect(callTargetOf("p3")).toBe(0) // non-call provider is outside the call pool
})

test("ledger counts call days, burden, and positions per provider", () => {
  const p1 = rowOf("p1")
  expect(p1.call_count, "p1 holds first on 06-17 and first_last on 06-19").toBe(2)
  expect(p1.call_burden, "two weekday calls at weight 1.0").toBeCloseTo(2.0, 10)
  expect(p1.first_count, "normal_first + normal_first_last").toBe(2)
  expect(p1.last_count, "normal_first_last also counts as last-equivalent burden").toBe(1)
  expect(p1.weekend_count, "p1 never works a weekend call day").toBe(0)

  const p2 = rowOf("p2")
  expect(p2.call_burden, "weekday 1.0 (Thu) + weekend 1.5 (Sat)").toBeCloseTo(2.5, 10)
  expect(p2.weekend_burden, "Saturday first carries weekend call 1.5").toBeCloseTo(1.5, 10)
  expect(p2.second_count, "p2 holds second on 06-17").toBe(1)

  const p4 = rowOf("p4")
  expect(p4.call_count, "p4 only ever holds last, never the call slot").toBe(0)
  expect(p4.last_count, "last on 06-17, 06-18, 06-20").toBe(3)

  const p3 = rowOf("p3")
  expect(p3.middle_count, "p3 holds one normal middle plus one eye middle-equivalent slot").toBe(2)
  expect(p3.eye_count, "p3 holds the eye slot on 06-18").toBe(1)
})

test("call_delta sign reflects over- vs under-target call burden", () => {
  expect(rowOf("p1").call_delta, "2.0 burden vs 1.8 target → slightly over").toBeGreaterThan(0)
  expect(rowOf("p2").call_delta, "2.5 burden vs 0.9 target → well over").toBeGreaterThan(0)
  expect(rowOf("p4").call_delta, "0 burden vs 1.8 target → under").toBeLessThan(0)
})

test("aggregates report spread over each ledger pool", () => {
  // last_count over the call pool {p1:0, p2:0, p4:3}.
  expect(card.aggregates.last_count.max, "p4 carries every last").toBe(3)
  expect(card.aggregates.last_count.min).toBe(0)
  expect(card.aggregates.last_count.spread).toBe(3)
  // eye_count pool is just eye-eligible p3, so there is no spread.
  expect(card.aggregates.eye_count.spread, "single-provider eye pool").toBe(0)
  expect(card.aggregates.workday_count.max, "p4 works three days").toBe(3)
  expect(card.largest_positive_delta, "p2 is furthest above target").toBeCloseTo(1.6, 10)
  expect(card.largest_negative_delta, "p4 is furthest below target").toBeCloseTo(-1.8, 10)
})

test("excluded pools list providers outside each pool in roster order", () => {
  expect(card.excluded_pools.call.map(String), "only the non-call provider").toEqual(["p3"])
  expect(card.excluded_pools.eye.map(String), "every non-eye provider, roster order").toEqual([
    "p1",
    "p2",
    "p4",
  ])
})

test("cluster metrics report runs, weekend-free violations, and call spacing", () => {
  const cl = (id: string) => {
    const r = card.clusters.providers.find((x) => x.provider_id === id)
    if (r === undefined) throw new Error(`no cluster row for ${id}`)
    return r
  }
  expect(card.clusters.consecutive_call_violations, "valid schedule has no back-to-back calls").toBe(0)
  expect(card.clusters.post_call_violations, "valid schedule has no post-call work").toBe(0)
  // p4 works 06-17,06-18 (a run of 2) then 06-20 (a run of 1).
  expect(cl("p4").max_consecutive_workdays).toBe(2)
  expect(cl("p4").workday_run_distribution).toEqual([2, 1])
  // p1's two call days are 06-17 and 06-19 → a two-day gap.
  expect(cl("p1").call_spacing_min, "06-17 to 06-19").toBe(2)
  expect(cl("p1").call_spacing_avg).toBeCloseTo(2, 10)
  // p4 never has call, so spacing is undefined.
  expect(cl("p4").call_spacing_min).toBeNull()
  expect(cl("p4").call_spacing_avg).toBeNull()
})

test("objective contributions cover every soft rule with finite numbers", () => {
  for (const id of SOFT_RULE_IDS) {
    const v = card.objective_contributions[id]
    expect(Number.isFinite(v), `${id} contribution should be a finite number, got ${v}`).toBe(true)
  }
  // Recomputed independently: Σ_call-pool |call_burden − target.call| = |2.0−1.8|+|2.5−0.9|+|0−1.8|.
  expect(card.objective_contributions.S_BALANCE_CALL_BURDEN).toBeCloseTo(3.6, 10)
  // Adjacent worked-day pairs: p1=0, p2=1, p4=1, p3=1.
  expect(card.objective_contributions.S_AVOID_WORK_CLUSTERS).toBe(3)
})
