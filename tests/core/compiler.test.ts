import { describe, expect, test } from "bun:test"
import { generateSchedule } from "@qgenda/core/api/generateSchedule"
import { compilePlanningScenario } from "@qgenda/core/compiler/compilePlanningScenario"
import { ScheduleScenario } from "@qgenda/core/domain/scenario"
import { PlanningState } from "@qgenda/core/planning/planningSchema"
import { Schema } from "effect"
import { sampleGeneration, samplePlanning, samplePlanningJson } from "../fixtures/planning"

const compileValid = () => {
  const result = compilePlanningScenario({ state: samplePlanning(), generation: sampleGeneration() })
  if (result.status !== "valid")
    throw new Error(`expected valid compile, got ${JSON.stringify(result.diagnostics)}`)
  return result
}

describe("compilePlanningScenario", () => {
  test("compiles a valid planning month into an engine-acceptable scenario", () => {
    const { scenario, scenario_hash, diagnostics } = compileValid()
    expect(
      diagnostics.filter((d) => d.severity === "error"),
      "no blocking diagnostics",
    ).toEqual([])
    expect(scenario_hash, "the compiler owns the scenario hash used by previews and snapshots").toMatch(
      /^sha256:/,
    )
    // The compiled scenario must satisfy the engine schema exactly, including rejecting unknown fields.
    expect(() =>
      Schema.decodeUnknownSync(ScheduleScenario)(scenario, { onExcessProperty: "error" }),
    ).not.toThrow()
    expect(scenario.schema_version).toBe("v0.1")
    expect(scenario.horizon.timezone, "timezone comes from the workspace").toBe("America/Los_Angeles")
    expect(scenario.days.length, "one day per horizon date").toBe(7)
    expect(scenario.providers.map((p) => String(p.id))).toContain("dr_sub")
  })

  test("attaches in-horizon holidays and weekend blocks and warns when dropping out-of-horizon holidays", () => {
    const state = Schema.decodeUnknownSync(PlanningState)({
      ...samplePlanningJson,
      holidays: [
        { holiday_id: "h_in", date: "2026-03-06", label: "In", class: "minor", weekend_block_id: null },
        { holiday_id: "h_out", date: "2026-06-01", label: "Out", class: "major", weekend_block_id: null },
      ],
      weekend_blocks: [
        {
          weekend_block_id: "wb",
          label: "Weekend",
          dates: ["2026-03-07", "2026-03-08"],
          split_required: false,
          required_distinct_call_providers: 1,
        },
      ],
    })
    const { scenario, diagnostics } = (() => {
      const r = compilePlanningScenario({ state, generation: sampleGeneration() })
      if (r.status !== "valid") throw new Error(JSON.stringify(r.diagnostics))
      return r
    })()
    expect(
      scenario.holidays.map((h) => String(h.id)),
      "only the in-horizon holiday is compiled",
    ).toEqual(["h_in"])
    expect(String(scenario.days.find((d) => d.date === "2026-03-06")?.holiday_id)).toBe("h_in")
    expect(String(scenario.days.find((d) => d.date === "2026-03-07")?.weekend_block_id)).toBe("wb")
    expect(scenario.weekend_blocks.map((b) => String(b.id))).toEqual(["wb"])
    expect(diagnostics.map((d) => d.code)).toContain("C_HOLIDAY_OUTSIDE_HORIZON")
  })

  test("blocks generation with diagnostics when a horizon date has no demand", () => {
    const noWednesday = Schema.decodeUnknownSync(PlanningState)({
      ...samplePlanningJson,
      demand_templates: samplePlanningJson.demand_templates.filter((t) => t.weekday !== "wednesday"),
    })
    const result = compilePlanningScenario({ state: noWednesday, generation: sampleGeneration() })
    expect(result.status).toBe("invalid_input")
    if (result.status === "invalid_input")
      expect(result.diagnostics.map((d) => d.code)).toContain("C_MISSING_DEMAND_FOR_DATE")
  })

  test("blocks generation at the compiler boundary when the horizon is reversed", () => {
    const result = compilePlanningScenario({
      state: samplePlanning(),
      generation: { horizon: { start_date: "2026-03-08", end_date: "2026-03-02" } },
    })
    expect(result.status).toBe("invalid_input")
    if (result.status === "invalid_input")
      expect(result.diagnostics.map((d) => d.code)).toContain("C_INVALID_HORIZON")
  })

  test("blocks generation when date-specific unavailability removes the only call provider", () => {
    const state = Schema.decodeUnknownSync(PlanningState)({
      ...samplePlanningJson,
      providers: [samplePlanningJson.providers[0]],
      unavailability: [
        {
          unavailability_id: "vac_only_call",
          provider_id: "dr_a",
          start_date: "2026-03-02",
          end_date: "2026-03-02",
          kind: "vacation",
          label: "Vacation",
        },
      ],
    })
    const result = compilePlanningScenario({
      state,
      generation: { horizon: { start_date: "2026-03-02", end_date: "2026-03-02" } },
    })
    expect(result.status).toBe("invalid_input")
    if (result.status === "invalid_input")
      expect(result.diagnostics.map((d) => d.code)).toContain("C_NO_CALL_ELIGIBLE_PROVIDERS")
  })

  test("blocks generation when normal list slots have no call-eligible provider", () => {
    const state = Schema.decodeUnknownSync(PlanningState)({
      ...samplePlanningJson,
      providers: [{ ...samplePlanningJson.providers[0], call_eligible: false }],
      demand_templates: samplePlanningJson.demand_templates.map((t) =>
        t.weekday === "monday" ? { ...t, call_required: false, normal_list_slots: 1 } : t,
      ),
    })
    const result = compilePlanningScenario({
      state,
      generation: { horizon: { start_date: "2026-03-02", end_date: "2026-03-02" } },
    })
    expect(result.status).toBe("invalid_input")
    if (result.status === "invalid_input")
      expect(result.diagnostics.map((d) => d.code)).toContain("C_NO_CALL_ELIGIBLE_PROVIDERS")
  })

  test("blocks generation when weekend skill demand lacks call-plus-skill eligible providers", () => {
    const state = Schema.decodeUnknownSync(PlanningState)({
      ...samplePlanningJson,
      providers: [
        { ...samplePlanningJson.providers[0], provider_id: "caller", eye_eligible: false },
        {
          ...samplePlanningJson.providers[4],
          provider_id: "eye_only",
          call_eligible: false,
          eye_eligible: true,
        },
      ],
      date_exceptions: [
        {
          exception_id: "weekend_eye",
          date: "2026-03-07",
          room_count: 1,
          normal_list_slots: 0,
          eye_slots: 1,
          dental_slots: 0,
          call_required: false,
          label: "Weekend eye",
        },
      ],
    })
    const result = compilePlanningScenario({
      state,
      generation: { horizon: { start_date: "2026-03-07", end_date: "2026-03-07" } },
    })
    expect(result.status).toBe("invalid_input")
    if (result.status === "invalid_input")
      expect(result.diagnostics.map((d) => d.code)).toContain("C_NO_EYE_ELIGIBLE_PROVIDERS")
  })

  test("blocks split weekend blocks that have no call dates to split", () => {
    const state = Schema.decodeUnknownSync(PlanningState)({
      ...samplePlanningJson,
      weekend_blocks: [
        {
          weekend_block_id: "closed_weekend",
          label: "Closed weekend",
          dates: ["2026-03-07"],
          split_required: true,
          required_distinct_call_providers: 1,
        },
      ],
    })
    const result = compilePlanningScenario({
      state,
      generation: { horizon: { start_date: "2026-03-07", end_date: "2026-03-07" } },
    })
    expect(result.status).toBe("invalid_input")
    if (result.status === "invalid_input")
      expect(result.diagnostics.map((d) => d.code)).toContain("C_NO_CALL_ELIGIBLE_PROVIDERS")
  })

  test("excludes providers who are inactive for the full horizon from the compiled scenario", () => {
    const state = Schema.decodeUnknownSync(PlanningState)({
      ...samplePlanningJson,
      providers: [
        ...samplePlanningJson.providers,
        {
          provider_id: "dr_future",
          display_name: "Future",
          fte: 1,
          call_eligible: true,
          eye_eligible: false,
          dental_eligible: false,
          active_from: "2026-12-01",
          active_until: null,
        },
      ],
    })
    const result = compilePlanningScenario({ state, generation: sampleGeneration() })
    expect(result.status).toBe("valid")
    if (result.status === "valid") {
      expect(result.diagnostics.map((d) => d.code)).toContain("C_PROVIDER_INACTIVE_IN_HORIZON")
      expect(result.scenario.providers.map((p) => String(p.id))).not.toContain("dr_future")
    }
  })

  test("rejects unknown fields at the compiler boundary", () => {
    const result = compilePlanningScenario({
      state: { ...samplePlanningJson, extra_field: true },
      generation: sampleGeneration(),
    })
    expect(result.status).toBe("invalid_input")
    if (result.status === "invalid_input")
      expect(result.diagnostics.map((d) => d.code)).toContain("C_PLANNING_SCHEMA_INVALID")
  })

  test("the compiled scenario generates an optimal, hard-rule-clean schedule", async () => {
    const { scenario } = compileValid()
    const result = await generateSchedule(scenario)
    expect(result.status, `warnings: ${result.warnings.join("; ")}`).toBe("optimal")
    expect(result.hard_rule_report.violation_count, JSON.stringify(result.hard_rule_report.violations)).toBe(
      0,
    )
    expect(
      result.assignments.length,
      "weekday call slots plus the Wednesday eye and Thursday dental slots",
    ).toBe(7)
  })
})
