import { describe, expect, test } from "bun:test"
import { generateSchedule } from "@qgenda/core/api/generateSchedule"
import { expandDay } from "@qgenda/core/domain/calendar"
import { ScheduleScenario } from "@qgenda/core/domain/scenario"
import type { Assignment as AssignmentT, ScheduleResult } from "@qgenda/core/domain/schedule"
import { Assignment } from "@qgenda/core/domain/schedule"
import type { HardRuleId } from "@qgenda/core/rules/catalog"
import { HARD_RULE_IDS } from "@qgenda/core/rules/catalog"
import { DEFAULT_WEIGHTS } from "@qgenda/core/rules/weights"
import { postsolve } from "@qgenda/core/validation/postsolve"
import { Schema } from "effect"

// ---------------------------------------------------------------------------
// Group A: real CP-SAT solver runs via generateSchedule against shipped fixtures.
// These exercise the spec "Acceptance Criteria" end to end. Each call drives the
// actual solver (~2-3s), so the number of invocations is kept small.
// ---------------------------------------------------------------------------

const scenarioPath = (name: string) => new URL(`../../examples/scenarios/${name}`, import.meta.url).pathname

// Decode a fixture so the test can derive expectations (slots, eligibility) from the
// same canonical scenario the engine consumes.
const decodeFixture = async (name: string) =>
  Schema.decodeUnknownSync(ScheduleScenario)(await Bun.file(scenarioPath(name)).json(), {
    onExcessProperty: "error",
  })

const run = (name: string): Promise<ScheduleResult> =>
  Bun.file(scenarioPath(name))
    .json()
    .then((raw) => generateSchedule(raw))

const providerOf = (scenario: ScheduleScenario, id: string) => {
  const p = scenario.providers.find((x) => x.id === id)
  if (p === undefined) throw new Error(`fixture has no provider ${id}`)
  return p
}

describe("month-basic: full acceptance via the real solver", () => {
  test("returns an optimal, fully covered, hard-rule-clean schedule satisfying every call rule", async () => {
    const scenario = await decodeFixture("month-basic.json")
    const result = await run("month-basic.json")

    expect(
      result.status,
      `expected optimal; got ${result.status} (warnings: ${result.warnings.join("; ")})`,
    ).toBe("optimal")
    expect(
      result.hard_rule_report.violation_count,
      `hard-rule report: ${JSON.stringify(result.hard_rule_report.violations)}`,
    ).toBe(0)

    // Every expected slot is assigned exactly once: counts and the slot_id sets match.
    const expectedSlotIds = scenario.days.flatMap(expandDay).map((s) => s.slot_id)
    expect(result.assignments.length, "one assignment per generated slot").toBe(expectedSlotIds.length)
    expect(
      new Set(result.assignments.map((a) => a.slot_id)),
      "assigned slot_ids equal expected slot_ids",
    ).toEqual(new Set(expectedSlotIds))

    // No provider holds two slots on the same date.
    const perDate = new Map<string, Set<string>>()
    for (const a of result.assignments) {
      const seen = perDate.get(a.date) ?? new Set<string>()
      expect(seen.has(a.provider_id), `provider ${a.provider_id} assigned twice on ${a.date}`).toBe(false)
      seen.add(a.provider_id)
      perDate.set(a.date, seen)
    }

    // Call/weekend/holiday slots only go to call-eligible providers.
    const callSlots = new Set(["normal_first", "normal_first_last", "normal_second", "normal_last"])
    for (const a of result.assignments) {
      const provider = providerOf(scenario, a.provider_id)
      if (callSlots.has(a.slot_type))
        expect(provider.call_eligible, `${a.slot_type} on ${a.date} held by non-call ${a.provider_id}`).toBe(
          true,
        )
      if (a.weekend || a.holiday_id !== null)
        expect(
          provider.call_eligible,
          `weekend/holiday slot on ${a.date} held by non-call ${a.provider_id}`,
        ).toBe(true)
    }

    // No provider holds derived call on two consecutive horizon dates, and nobody works the day after call.
    const callDates = new Map<string, Set<string>>()
    for (const a of result.assignments) {
      if (!a.derived_call) continue
      const set = callDates.get(a.provider_id) ?? new Set<string>()
      set.add(a.date)
      callDates.set(a.provider_id, set)
    }
    const workDates = new Map<string, Set<string>>()
    for (const a of result.assignments) {
      const set = workDates.get(a.provider_id) ?? new Set<string>()
      set.add(a.date)
      workDates.set(a.provider_id, set)
    }
    const nextDay = (date: string) =>
      new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    for (const [providerId, dates] of callDates) {
      for (const date of dates) {
        const after = nextDay(date)
        expect(dates.has(after), `provider ${providerId} has consecutive call on ${date} and ${after}`).toBe(
          false,
        )
        expect(
          workDates.get(providerId)?.has(after) ?? false,
          `provider ${providerId} works ${after}, the day after call on ${date}`,
        ).toBe(false)
      }
    }

    // The scorecard agrees there are no cluster violations.
    expect(
      result.scorecard.clusters.consecutive_call_violations,
      "scorecard consecutive-call violations",
    ).toBe(0)
    expect(result.scorecard.clusters.post_call_violations, "scorecard post-call violations").toBe(0)
  })

  test("is deterministic: same input and seed yield byte-stable assignments and an equal scenario hash", async () => {
    const [first, second] = await Promise.all([run("month-basic.json"), run("month-basic.json")])
    expect(second.scenario_hash, "scenario_hash is byte-stable across runs").toBe(first.scenario_hash)
    expect(second.assignments, "assignment ordering and values are byte-stable across runs").toEqual(
      first.assignments,
    )
  })
})

describe("month-eye-dental: subspecialty eligibility via the real solver", () => {
  test("routes eye slots to eye-eligible and dental slots to dental-eligible providers with no violations", async () => {
    const scenario = await decodeFixture("month-eye-dental.json")
    const result = await run("month-eye-dental.json")

    expect(
      result.status,
      `expected optimal; got ${result.status} (warnings: ${result.warnings.join("; ")})`,
    ).toBe("optimal")
    expect(
      result.hard_rule_report.violation_count,
      `hard-rule report: ${JSON.stringify(result.hard_rule_report.violations)}`,
    ).toBe(0)

    for (const a of result.assignments) {
      const provider = providerOf(scenario, a.provider_id)
      if (a.slot_type === "eye_middle")
        expect(provider.eye_eligible, `eye_middle on ${a.date} held by non-eye ${a.provider_id}`).toBe(true)
      if (a.slot_type === "dental_middle")
        expect(
          provider.dental_eligible,
          `dental_middle on ${a.date} held by non-dental ${a.provider_id}`,
        ).toBe(true)
    }
  })
})

describe("month-infeasible-post-call: infeasibility is reported, not faked", () => {
  test("returns infeasible with no assignments when one caller cannot cover consecutive call days", async () => {
    const result = await run("month-infeasible-post-call.json")
    expect(
      result.status,
      `expected infeasible; got ${result.status} (warnings: ${result.warnings.join("; ")})`,
    ).toBe("infeasible")
    expect(result.assignments.length, "an infeasible result carries no partial assignments").toBe(0)
  })
})

describe("long weekend split: the solver honors required_distinct_call_providers", () => {
  test("uses exactly two distinct call providers across a split-required weekend block", async () => {
    const raw = {
      schema_version: "v0.1",
      scenario_id: "long-weekend-split",
      horizon: { start_date: "2026-05-01", end_date: "2026-05-03", timezone: "UTC" },
      providers: ["p1", "p2", "p3"].map((id) => ({
        id,
        display_name: id,
        fte: 1,
        call_eligible: true,
        eye_eligible: false,
        dental_eligible: false,
        active_from: "2026-01-01",
        active_until: null,
      })),
      days: ["2026-05-01", "2026-05-02", "2026-05-03"].map((date) => ({
        date,
        room_count: 1,
        normal_list_slots: 1,
        eye_slots: 0,
        dental_slots: 0,
        call_required: true,
        holiday_id: null,
        weekend_block_id: "lw",
      })),
      holidays: [],
      weekend_blocks: [
        {
          id: "lw",
          dates: ["2026-05-01", "2026-05-02", "2026-05-03"],
          split_required: true,
          required_distinct_call_providers: 2,
        },
      ],
      opening_ledger: [],
    }
    const result = await generateSchedule(raw)
    expect(result.status, `expected optimal; got ${result.status} (${result.warnings.join("; ")})`).toBe(
      "optimal",
    )
    expect(result.hard_rule_report.violation_count, JSON.stringify(result.hard_rule_report.violations)).toBe(
      0,
    )
    const blockDates = new Set(["2026-05-01", "2026-05-02", "2026-05-03"])
    const callers = new Set(
      result.assignments.filter((a) => a.derived_call && blockDates.has(a.date)).map((a) => a.provider_id),
    )
    expect(
      callers.size,
      `block should use exactly 2 distinct call providers, got ${[...callers].join(",")}`,
    ).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Group B: every hard rule exercised through the pure postsolve validator.
//
// One shared four-day base scenario (Wed 06-17 .. Sat 06-20) with a split-required
// Fri+Sat weekend block, plus a hand-built assignment list that is valid by hand.
// Each rule gets a targeted mutation (of the assignment list or the scenario) that
// triggers it. postsolve re-derives every fact, so a base run must be clean.
// ---------------------------------------------------------------------------

// p5 is an "ineligible for everything" provider kept off the valid roster usage; the
// eligibility mutations swap a slot to p5 so exactly one eligibility rule fires.
const baseRaw = {
  schema_version: "v0.1",
  scenario_id: "postsolve-base",
  horizon: { start_date: "2026-06-17", end_date: "2026-06-20", timezone: "UTC" },
  providers: [
    {
      id: "p1",
      display_name: "P1",
      fte: 1,
      call_eligible: true,
      eye_eligible: true,
      dental_eligible: true,
      active_from: "2026-01-01",
      active_until: null,
    },
    {
      id: "p2",
      display_name: "P2",
      fte: 1,
      call_eligible: true,
      eye_eligible: false,
      dental_eligible: false,
      active_from: "2026-01-01",
      active_until: null,
    },
    {
      id: "p3",
      display_name: "P3",
      fte: 1,
      call_eligible: false,
      eye_eligible: true,
      dental_eligible: true,
      active_from: "2026-01-01",
      active_until: null,
    },
    {
      id: "p4",
      display_name: "P4",
      fte: 1,
      call_eligible: true,
      eye_eligible: false,
      dental_eligible: true,
      active_from: "2026-01-01",
      active_until: null,
    },
    {
      id: "p5",
      display_name: "P5",
      fte: 1,
      call_eligible: false,
      eye_eligible: false,
      dental_eligible: false,
      active_from: "2026-01-01",
      active_until: null,
    },
  ],
  days: [
    {
      date: "2026-06-17",
      room_count: 4,
      normal_list_slots: 2,
      eye_slots: 0,
      dental_slots: 0,
      call_required: true,
      holiday_id: null,
      weekend_block_id: null,
    },
    {
      date: "2026-06-18",
      room_count: 4,
      normal_list_slots: 1,
      eye_slots: 1,
      dental_slots: 1,
      call_required: true,
      holiday_id: null,
      weekend_block_id: null,
    },
    {
      date: "2026-06-19",
      room_count: 4,
      normal_list_slots: 1,
      eye_slots: 0,
      dental_slots: 0,
      call_required: true,
      holiday_id: null,
      weekend_block_id: "wb",
    },
    {
      date: "2026-06-20",
      room_count: 4,
      normal_list_slots: 1,
      eye_slots: 0,
      dental_slots: 0,
      call_required: true,
      holiday_id: null,
      weekend_block_id: "wb",
    },
  ],
  holidays: [],
  weekend_blocks: [
    {
      id: "wb",
      dates: ["2026-06-19", "2026-06-20"],
      split_required: true,
      required_distinct_call_providers: 2,
    },
  ],
  opening_ledger: [],
}

const decode = (raw: unknown): ScheduleScenario =>
  Schema.decodeUnknownSync(ScheduleScenario)(raw, { onExcessProperty: "error" })

const baseScenario = decode(baseRaw)
const baseSlots = baseScenario.days.flatMap(expandDay)

// Build one assignment. postsolve re-derives call/weekend/holiday, so the carried
// flags are set to harmless valid defaults; slot_id matches expandDay's scheme.
const mk = (
  date: string,
  slot_type: AssignmentT["slot_type"],
  provider_id: string,
  idx?: number,
): AssignmentT => {
  const slot_id = idx === undefined ? `${date}:${slot_type}` : `${date}:${slot_type}:${idx}`
  const firstEquivalent = slot_type === "normal_first" || slot_type === "normal_first_last"
  return Schema.decodeUnknownSync(Assignment)({
    date,
    slot_id,
    slot_type,
    provider_id,
    derived_call: firstEquivalent,
    weekend: date === "2026-06-19" || date === "2026-06-20",
    holiday_id: null,
  })
}

// Hand-checked valid roster:
//   06-17 Wed  call=p1 (first), p2 (last)
//   06-18 Thu  call=p2 (first_last), eye=p3, dental=p4   [p1 off: post-call from 06-17]
//   06-19 Fri  call=p4 (first_last)                      [p2 off: post-call from 06-18]
//   06-20 Sat  call=p1 (first_last)                      [p4 off: post-call from 06-19]
// Block 06-19/06-20 callers = {p4, p1} = 2 distinct (matches required).
const validAssignments = (): AssignmentT[] => [
  mk("2026-06-17", "normal_first", "p1"),
  mk("2026-06-17", "normal_last", "p2"),
  mk("2026-06-18", "normal_first_last", "p2"),
  mk("2026-06-18", "eye_middle", "p3", 1),
  mk("2026-06-18", "dental_middle", "p4", 1),
  mk("2026-06-19", "normal_first_last", "p4"),
  mk("2026-06-20", "normal_first_last", "p1"),
]

// Replace the assignment for a given slot_id with the same slot held by another provider.
const reassign = (assignments: AssignmentT[], slot_id: string, provider_id: string): AssignmentT[] =>
  assignments.map((a) =>
    a.slot_id === slot_id ? mk(a.date, a.slot_type, provider_id, indexOf(a.slot_id)) : a,
  )

const indexOf = (slot_id: string): number | undefined => {
  const parts = slot_id.split(":")
  const last = parts[parts.length - 1]
  return parts.length === 3 && last !== undefined ? Number(last) : undefined
}

const ruleIds = (violations: ReturnType<typeof postsolve>) => violations.map((v) => v.rule_id)

test("base scenario with a valid roster has zero postsolve violations", () => {
  const violations = postsolve(baseScenario, baseSlots, DEFAULT_WEIGHTS, validAssignments())
  expect(violations, `base roster should be clean, got: ${JSON.stringify(violations)}`).toEqual([])
})

// One mutation per hard rule. Each entry returns the (scenario, slots, assignments)
// triple to feed postsolve; the test asserts the named rule_id is reported.
type Case = { scenario: ScheduleScenario; slots: typeof baseSlots; assignments: AssignmentT[] }

const cases: Record<HardRuleId, () => Case> = {
  // Drop a covered horizon date's day entry but keep its slots and assignments.
  H_HORIZON_COMPLETE: () => ({
    scenario: decode({ ...baseRaw, days: baseRaw.days.filter((d) => d.date !== "2026-06-18") }),
    slots: baseSlots,
    assignments: validAssignments(),
  }),
  H_CALL_REQUIRES_FIRST_SLOT: () => {
    const scenario = decode({
      ...baseRaw,
      days: baseRaw.days.map((d) => (d.date === "2026-06-18" ? { ...d, normal_list_slots: 0 } : d)),
    })
    return {
      scenario,
      slots: scenario.days.flatMap(expandDay),
      assignments: validAssignments().filter((a) => a.slot_id !== "2026-06-18:normal_first_last"),
    }
  },
  // Drop one assignment so its slot is left uncovered.
  H_COVER_ALL_SLOTS: () => ({
    scenario: baseScenario,
    slots: baseSlots,
    assignments: validAssignments().filter((a) => a.slot_id !== "2026-06-18:dental_middle:1"),
  }),
  // Give p1 both the first and last slot on 06-17.
  H_PROVIDER_ONE_SLOT_PER_DAY: () => ({
    scenario: baseScenario,
    slots: baseSlots,
    assignments: reassign(validAssignments(), "2026-06-17:normal_last", "p1"),
  }),
  // p3 only becomes active after the horizon, yet works 06-18.
  H_PROVIDER_ACTIVE: () => ({
    scenario: decode({
      ...baseRaw,
      providers: baseRaw.providers.map((p) => (p.id === "p3" ? { ...p, active_from: "2026-12-01" } : p)),
    }),
    slots: baseSlots,
    assignments: validAssignments(),
  }),
  // p3 is marked unavailable on the day they work.
  H_PROVIDER_AVAILABLE: () => ({
    scenario: decode({
      ...baseRaw,
      providers: baseRaw.providers.map((p) =>
        p.id === "p3" ? { ...p, unavailable_dates: ["2026-06-18"] } : p,
      ),
    }),
    slots: baseSlots,
    assignments: validAssignments(),
  }),
  // 06-18 holds 3 assignments but only 2 rooms.
  H_ROOM_CAPACITY: () => ({
    scenario: decode({
      ...baseRaw,
      days: baseRaw.days.map((d) => (d.date === "2026-06-18" ? { ...d, room_count: 2 } : d)),
    }),
    slots: baseSlots,
    assignments: validAssignments(),
  }),
  // Non-call p5 takes a weekday first slot (no weekend/post-call coupling).
  H_CALL_ELIGIBLE_FOR_FIRST: () => ({
    scenario: baseScenario,
    slots: baseSlots,
    assignments: reassign(validAssignments(), "2026-06-17:normal_first", "p5"),
  }),
  // Non-call p5 takes a weekday last slot.
  H_CALL_ELIGIBLE_FOR_SECOND_LAST: () => ({
    scenario: baseScenario,
    slots: baseSlots,
    assignments: reassign(validAssignments(), "2026-06-17:normal_last", "p5"),
  }),
  // Make 06-18 a holiday so non-call p3 working it violates the weekend/holiday rule.
  H_NON_CALL_NO_WEEKEND_OR_HOLIDAY: () => ({
    scenario: decode({
      ...baseRaw,
      days: baseRaw.days.map((d) => (d.date === "2026-06-18" ? { ...d, holiday_id: "h1" } : d)),
      holidays: [{ id: "h1", date: "2026-06-18", label: "Holiday", class: "minor", weekend_block_id: null }],
    }),
    slots: baseSlots,
    assignments: validAssignments(),
  }),
  // Non-eye p5 takes the eye slot.
  H_EYE_ELIGIBILITY: () => ({
    scenario: baseScenario,
    slots: baseSlots,
    assignments: reassign(validAssignments(), "2026-06-18:eye_middle:1", "p5"),
  }),
  // Non-dental p5 takes the dental slot.
  H_DENTAL_ELIGIBILITY: () => ({
    scenario: baseScenario,
    slots: baseSlots,
    assignments: reassign(validAssignments(), "2026-06-18:dental_middle:1", "p5"),
  }),
  // p1 holds call on 06-17 and again (first_last) on 06-18: consecutive call.
  H_NO_CONSECUTIVE_CALLS: () => ({
    scenario: baseScenario,
    slots: baseSlots,
    assignments: reassign(validAssignments(), "2026-06-18:normal_first_last", "p1"),
  }),
  // p1 has call on 06-17 and then works (dental) on 06-18 without call.
  H_POST_CALL_DAY_OFF: () => ({
    scenario: baseScenario,
    slots: baseSlots,
    assignments: reassign(validAssignments(), "2026-06-18:dental_middle:1", "p1"),
  }),
  // Require 3 distinct block callers while the roster supplies only 2.
  H_WEEKEND_BLOCK_SPLIT: () => ({
    scenario: decode({
      ...baseRaw,
      weekend_blocks: [
        {
          id: "wb",
          dates: ["2026-06-19", "2026-06-20"],
          split_required: true,
          required_distinct_call_providers: 3,
        },
      ],
    }),
    slots: baseSlots,
    assignments: validAssignments(),
  }),
}

describe("postsolve reports each hard rule", () => {
  // Iterating HARD_RULE_IDS guarantees every catalog hard rule is individually exercised.
  for (const ruleId of HARD_RULE_IDS) {
    test(`reports ${ruleId} for a targeted violation`, () => {
      const build = cases[ruleId]
      expect(build, `no postsolve case defined for ${ruleId}`).toBeDefined()
      const { scenario, slots, assignments } = build()
      const reported = ruleIds(postsolve(scenario, slots, DEFAULT_WEIGHTS, assignments))
      expect(reported, `expected ${ruleId} among reported rules, got: ${JSON.stringify(reported)}`).toContain(
        ruleId,
      )
    })
  }

  test("covers all catalog hard rules", () => {
    expect(Object.keys(cases).sort(), "a postsolve case exists for every HardRuleId").toEqual(
      [...HARD_RULE_IDS].sort(),
    )
    expect(HARD_RULE_IDS.length, "catalog defines exactly 15 hard rules").toBe(15)
  })

  test("reports H_COVER_ALL_SLOTS when assignment metadata disagrees with the canonical slot", () => {
    const bad = validAssignments().map((a) =>
      a.slot_id === "2026-06-17:normal_first" ? { ...a, slot_type: "normal_last" as const } : a,
    )
    expect(ruleIds(postsolve(baseScenario, baseSlots, DEFAULT_WEIGHTS, bad))).toContain("H_COVER_ALL_SLOTS")
  })
})
