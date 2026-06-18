import { describe, expect, test } from "bun:test"
import { generateSchedule } from "@qgenda/core/api/generateSchedule"
import { compilePlanningScenario } from "@qgenda/core/compiler/compilePlanningScenario"
import { canonicalHash } from "@qgenda/core/domain/hash"
import { RunId } from "@qgenda/core/domain/ids"
import type { ScheduleScenario } from "@qgenda/core/domain/scenario"
import type { ScheduleResult } from "@qgenda/core/domain/schedule"
import { PlanningState } from "@qgenda/core/planning/planningSchema"
import { emptyScorecard } from "@qgenda/core/scorecard/scorecard"
import { openDatabase } from "@qgenda/storage/db"
import { getPlanning, replacePlanning } from "@qgenda/storage/repositories/planningRepository"
import {
  getScheduleRun,
  insertScheduleRun,
  listScheduleRuns,
} from "@qgenda/storage/repositories/scheduleRunRepository"
import { Schema } from "effect"
import { sampleGeneration, samplePlanning, samplePlanningJson } from "../fixtures/planning"

// Each test gets its own in-memory database; openDatabase applies the committed migrations from empty.
const freshDb = () => openDatabase(":memory:")

const compiledScenario = (): { scenario: ScheduleScenario; scenario_hash: string } => {
  const r = compilePlanningScenario({ state: samplePlanning(), generation: sampleGeneration() })
  if (r.status !== "valid") throw new Error(JSON.stringify(r.diagnostics))
  return { scenario: r.scenario, scenario_hash: r.scenario_hash }
}

const fakeResult = (scenario: ScheduleScenario): ScheduleResult => ({
  schema_version: "v0.1",
  scenario_id: scenario.scenario_id,
  status: "optimal",
  scenario_hash: canonicalHash(scenario),
  solver: {
    engine: "minizinc",
    backend: "ortools",
    status: "OPTIMAL_SOLUTION",
    objective_value: 0,
    wall_time_seconds: 0,
  },
  assignments: [],
  hard_rule_report: { violation_count: 0, violations: [] },
  scorecard: emptyScorecard(),
  warnings: [],
})

const stablePlanningOrder = (state: PlanningState): PlanningState => ({
  ...state,
  providers: [...state.providers].sort((a, b) => String(a.provider_id).localeCompare(String(b.provider_id))),
  unavailability: [...state.unavailability].sort((a, b) =>
    String(a.unavailability_id).localeCompare(String(b.unavailability_id)),
  ),
  demand_templates: [...state.demand_templates].sort(
    (a, b) =>
      a.weekday.localeCompare(b.weekday) || String(a.template_id).localeCompare(String(b.template_id)),
  ),
  date_exceptions: [...state.date_exceptions].sort(
    (a, b) => a.date.localeCompare(b.date) || String(a.exception_id).localeCompare(String(b.exception_id)),
  ),
  holidays: [...state.holidays].sort(
    (a, b) => a.date.localeCompare(b.date) || String(a.holiday_id).localeCompare(String(b.holiday_id)),
  ),
  weekend_blocks: [...state.weekend_blocks].sort((a, b) =>
    String(a.weekend_block_id).localeCompare(String(b.weekend_block_id)),
  ),
  opening_ledger: [...state.opening_ledger].sort(
    (a, b) =>
      a.cycle_start.localeCompare(b.cycle_start) ||
      String(a.provider_id).localeCompare(String(b.provider_id)),
  ),
})

describe("planning repository", () => {
  test("migrations apply from an empty database and the workspace starts empty", () => {
    expect(getPlanning(freshDb())).toBeNull()
  })

  test("whole-state replacement round-trips the planning state", () => {
    const db = freshDb()
    replacePlanning(db, samplePlanning())
    expect(getPlanning(db)).toEqual(stablePlanningOrder(samplePlanning()))
  })

  test("a second replacement fully supersedes the first", () => {
    const db = freshDb()
    replacePlanning(db, samplePlanning())
    const fewer = Schema.decodeUnknownSync(PlanningState)({
      ...samplePlanningJson,
      providers: samplePlanningJson.providers.slice(0, 2),
    })
    replacePlanning(db, fewer)
    expect(getPlanning(db)?.providers.length).toBe(2)
  })

  test("rejects a dangling provider reference and rolls back the transaction", () => {
    const db = freshDb()
    replacePlanning(db, samplePlanning())
    const dangling = Schema.decodeUnknownSync(PlanningState)({
      ...samplePlanningJson,
      unavailability: [
        {
          unavailability_id: "v1",
          provider_id: "ghost",
          start_date: "2026-03-03",
          end_date: "2026-03-04",
          kind: "leave",
          label: "x",
        },
      ],
    })
    expect(() => replacePlanning(db, dangling)).toThrow()
    // The failed transaction rolled back, leaving the previous good state intact.
    expect(getPlanning(db)?.providers.length).toBe(5)
  })
})

describe("schedule run repository", () => {
  test("persists an immutable run snapshot that survives later planning edits", () => {
    const db = freshDb()
    replacePlanning(db, samplePlanning())
    const { scenario, scenario_hash } = compiledScenario()
    const run = insertScheduleRun(db, {
      planning: samplePlanning(),
      scenario,
      scenario_hash,
      result: fakeResult(scenario),
    })

    // Edit live planning after the run is created.
    const edited = Schema.decodeUnknownSync(PlanningState)({
      ...samplePlanningJson,
      workspace: { ...samplePlanningJson.workspace, timezone: "UTC" },
    })
    replacePlanning(db, edited)

    const stored = getScheduleRun(db, run.run_id)
    expect(stored?.status, "run status persisted").toBe("optimal")
    expect(
      stored?.planning_snapshot.workspace.timezone,
      "snapshot is immutable despite the later edit to UTC",
    ).toBe("America/Los_Angeles")
    expect(stored?.compiled_scenario.scenario_id).toBe(scenario.scenario_id)
    expect(stored?.compiled_scenario_hash).toBe(scenario_hash)
    expect(stored?.engine_version).toBe("v0.1")
    expect(stored?.app_version).toBe("v0.2")
    expect(stored?.solver_backend).toBe("ortools")
    expect(listScheduleRuns(db).map((r) => r.run_id)).toContain(run.run_id)
  })

  test("returns null for an unknown run id", () => {
    expect(getScheduleRun(freshDb(), Schema.decodeUnknownSync(RunId)("run_missing"))).toBeNull()
  })

  test("stored compiled scenarios are reproducible through the engine", async () => {
    const db = freshDb()
    const { scenario, scenario_hash } = compiledScenario()
    const first = await generateSchedule(scenario)
    const run = insertScheduleRun(db, { planning: samplePlanning(), scenario, scenario_hash, result: first })
    const stored = getScheduleRun(db, run.run_id)
    if (stored === null) throw new Error("stored run missing")

    const second = await generateSchedule(stored.compiled_scenario)
    expect(second.scenario_hash).toBe(first.scenario_hash)
    expect(second.assignments).toEqual(first.assignments)
  })
})
