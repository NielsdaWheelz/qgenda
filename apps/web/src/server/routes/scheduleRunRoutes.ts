import { generateSchedule } from "@qgenda/core/api/generateSchedule"
import { compilePlanningScenario } from "@qgenda/core/compiler/compilePlanningScenario"
import { isWeekend } from "@qgenda/core/domain/calendar"
import { RunId } from "@qgenda/core/domain/ids"
import type { ScheduleScenario } from "@qgenda/core/domain/scenario"
import type { ScheduleResult, ScheduleStatus } from "@qgenda/core/domain/schedule"
import { GenerationRequest } from "@qgenda/core/planning/planningSchema"
import type { Db } from "@qgenda/storage/db"
import { getPlanning } from "@qgenda/storage/repositories/planningRepository"
import {
  getScheduleRun,
  insertScheduleRun,
  listScheduleRuns,
} from "@qgenda/storage/repositories/scheduleRunRepository"
import { Hono } from "hono"
import { decodeBody } from "../decodeBody"
import { decodeValue } from "../decodeValue"

// Generation and run history (spec "Generate Schedule", "Run History"). A run is persisted only when the
// compiled scenario reaches the engine; an invalid compile returns diagnostics and creates no run.
const httpStatus = (status: ScheduleStatus): 201 | 400 | 409 | 500 => {
  switch (status) {
    case "optimal":
    case "feasible":
      return 201
    case "invalid_input":
      return 400
    case "infeasible":
      return 409
    case "solver_error":
      return 500
  }
}

export type GenerateScheduleService = (scenario: ScheduleScenario) => Promise<ScheduleResult>

export function scheduleRunRoutes(db: Db, services: { generateSchedule?: GenerateScheduleService } = {}) {
  const app = new Hono()
  const runGenerator = services.generateSchedule ?? generateSchedule

  app.post("/schedule-runs", async (c) => {
    const decoded = decodeBody(GenerationRequest, await c.req.json().catch(() => null))
    if (!decoded.ok) return c.json({ status: "invalid_planning", errors: decoded.errors }, 400)
    const planning = getPlanning(db)
    if (planning === null)
      return c.json({ status: "invalid_planning", errors: ["No planning state saved yet."] }, 400)

    const compiled = compilePlanningScenario({ state: planning, generation: decoded.value })
    if (compiled.status === "invalid_input")
      return c.json({ status: "invalid_planning", diagnostics: compiled.diagnostics }, 400)

    const result = await runGenerator(compiled.scenario)
    const run = insertScheduleRun(db, {
      planning,
      scenario: compiled.scenario,
      scenario_hash: compiled.scenario_hash,
      result,
    })
    return c.json({ run_id: run.run_id, status: result.status, result }, httpStatus(result.status))
  })

  app.get("/schedule-runs", (c) => c.json(listScheduleRuns(db)))

  app.get("/schedule-runs/:run_id", (c) => {
    const runId = decodeValue(RunId, c.req.param("run_id"))
    if (!runId.ok) return c.json({ status: "invalid_input", errors: runId.errors }, 400)
    const run = getScheduleRun(db, runId.value)
    if (run === null) return c.json({ status: "not_found", errors: ["run not found"] }, 404)
    return c.json({
      run_id: run.run_id,
      created_at: run.created_at,
      horizon_start: run.horizon_start,
      horizon_end: run.horizon_end,
      status: run.status,
      compiled_scenario_hash: run.compiled_scenario_hash,
      opening_ledger_start_fresh: run.planning_snapshot.workspace.opening_ledger_start_fresh,
      opening_ledger: run.compiled_scenario.opening_ledger,
      days: run.compiled_scenario.days.map((day) => ({
        date: day.date,
        holiday_id: day.holiday_id,
        weekend: isWeekend(day.date, run.compiled_scenario.weekend_blocks),
      })),
      providers: run.compiled_scenario.providers.map((p) => ({ id: p.id, display_name: p.display_name })),
      result: run.result,
    })
  })

  app.post("/schedule-runs/:run_id/replay", async (c) => {
    const runId = decodeValue(RunId, c.req.param("run_id"))
    if (!runId.ok) return c.json({ status: "invalid_input", errors: runId.errors }, 400)
    const source = getScheduleRun(db, runId.value)
    if (source === null) return c.json({ status: "not_found", errors: ["run not found"] }, 404)

    const result = await runGenerator(source.compiled_scenario)
    const replay = insertScheduleRun(db, {
      planning: source.planning_snapshot,
      scenario: source.compiled_scenario,
      scenario_hash: source.compiled_scenario_hash,
      result,
    })
    return c.json({ run_id: replay.run_id, status: result.status, result }, httpStatus(result.status))
  })

  return app
}
