import { describe, expect, test } from "bun:test"
import { generateSchedule } from "@qgenda/core/api/generateSchedule"
import { compilePlanningScenario } from "@qgenda/core/compiler/compilePlanningScenario"
import { GenerationRequest, PlanningState } from "@qgenda/core/planning/planningSchema"
import { Schema } from "effect"

// The shipped example planning workspaces must compile and generate clean schedules through the real
// engine — they are the "representative months" a user recreates through the forms.
const compileAndRun = async (file: string, horizon: { start_date: string; end_date: string }) => {
  const raw = await Bun.file(new URL(`../../examples/planning/${file}`, import.meta.url).pathname).json()
  const state = Schema.decodeUnknownSync(PlanningState)(raw, { onExcessProperty: "error" })
  const compiled = compilePlanningScenario({
    state,
    generation: Schema.decodeUnknownSync(GenerationRequest)({ horizon }),
  })
  if (compiled.status !== "valid") throw new Error(`compile failed: ${JSON.stringify(compiled.diagnostics)}`)
  return generateSchedule(compiled.scenario)
}

const scorecardObjective = (result: Awaited<ReturnType<typeof compileAndRun>>): number =>
  Object.values(result.scorecard.objective_contributions).reduce((sum, value) => sum + value, 0)

function expectObjectiveTrace(result: Awaited<ReturnType<typeof compileAndRun>>): void {
  if (result.solver.objective_value === null) throw new Error("optimal result must include objective_value")
  expect(scorecardObjective(result), "scorecard contribution sum matches MiniZinc objective").toBe(
    result.solver.objective_value,
  )
}

describe("example planning workspaces", () => {
  test("basic-month generates an optimal, hard-rule-clean schedule", async () => {
    const result = await compileAndRun("basic-month.json", {
      start_date: "2026-03-02",
      end_date: "2026-03-13",
    })
    expect(result.status, result.warnings.join("; ")).toBe("optimal")
    expect(result.hard_rule_report.violation_count, JSON.stringify(result.hard_rule_report.violations)).toBe(
      0,
    )
    expectObjectiveTrace(result)
  })

  test("long-weekend-month honors the split weekend block with two distinct callers", async () => {
    const result = await compileAndRun("long-weekend-month.json", {
      start_date: "2026-03-02",
      end_date: "2026-03-08",
    })
    expect(result.status, result.warnings.join("; ")).toBe("optimal")
    expect(result.hard_rule_report.violation_count, JSON.stringify(result.hard_rule_report.violations)).toBe(
      0,
    )
    expectObjectiveTrace(result)
    const blockDates = new Set(["2026-03-07", "2026-03-08"])
    const callers = new Set(
      result.assignments.filter((a) => a.derived_call && blockDates.has(a.date)).map((a) => a.provider_id),
    )
    expect(callers.size, "the split block uses exactly two distinct call providers").toBe(2)
  })
})
