import { randomUUID } from "node:crypto"
import { IsoDate, RunId } from "@qgenda/core/domain/ids"
import { ScheduleScenario } from "@qgenda/core/domain/scenario"
import { ScheduleResult, ScheduleStatus } from "@qgenda/core/domain/schedule"
import { PlanningState } from "@qgenda/core/planning/planningSchema"
import { desc, eq } from "drizzle-orm"
import { Schema } from "effect"
import type { Db } from "../db"
import * as schema from "../schema"
import { strictDecode } from "../strictDecode"

// Immutable run snapshots (spec "Schedule Run Snapshot"). Each run records the planning snapshot, the
// compiled scenario and its hash, the engine result, and solver/app metadata, so a run can be reviewed,
// exported, and reproduced without the live planning tables. Runs are never mutated; re-running inserts a
// new row.

export type ScheduleRun = {
  run_id: RunId
  created_at: string
  horizon_start: IsoDate
  horizon_end: IsoDate
  status: ScheduleStatus
  planning_snapshot: PlanningState
  compiled_scenario: ScheduleScenario
  compiled_scenario_hash: string
  result: ScheduleResult
  engine_version: string
  app_version: string
  solver_backend: string
}

export type ScheduleRunSummary = Pick<
  ScheduleRun,
  "run_id" | "created_at" | "horizon_start" | "horizon_end" | "status"
>

export function insertScheduleRun(
  db: Db,
  input: {
    planning: PlanningState
    scenario: ScheduleScenario
    scenario_hash: string
    result: ScheduleResult
  },
): ScheduleRun {
  if (input.scenario_hash !== input.result.scenario_hash)
    throw new Error(
      `schedule run hash mismatch: compiler ${input.scenario_hash} != result ${input.result.scenario_hash}`,
    )
  const created_at = new Date().toISOString()
  const run: ScheduleRun = {
    run_id: Schema.decodeUnknownSync(RunId)(
      `run_${created_at.replace(/[^0-9]/g, "")}_${randomUUID().slice(0, 8)}`,
    ),
    created_at,
    horizon_start: input.scenario.horizon.start_date,
    horizon_end: input.scenario.horizon.end_date,
    status: input.result.status,
    planning_snapshot: input.planning,
    compiled_scenario: input.scenario,
    compiled_scenario_hash: input.scenario_hash,
    result: input.result,
    engine_version: input.scenario.schema_version,
    app_version: input.planning.workspace.schema_version,
    solver_backend: input.result.solver.backend,
  }
  db.insert(schema.scheduleRun)
    .values({
      run_id: run.run_id,
      created_at: run.created_at,
      horizon_start: run.horizon_start,
      horizon_end: run.horizon_end,
      status: run.status,
      planning_snapshot_json: run.planning_snapshot,
      compiled_scenario_json: run.compiled_scenario,
      compiled_scenario_hash: run.compiled_scenario_hash,
      schedule_result_json: run.result,
      engine_version: run.engine_version,
      app_version: run.app_version,
      solver_backend: run.solver_backend,
    })
    .run()
  return run
}

export function listScheduleRuns(db: Db): ScheduleRunSummary[] {
  return db
    .select({
      run_id: schema.scheduleRun.run_id,
      created_at: schema.scheduleRun.created_at,
      horizon_start: schema.scheduleRun.horizon_start,
      horizon_end: schema.scheduleRun.horizon_end,
      status: schema.scheduleRun.status,
    })
    .from(schema.scheduleRun)
    .orderBy(desc(schema.scheduleRun.created_at))
    .all()
    .map((r) => ({
      run_id: Schema.decodeUnknownSync(RunId)(r.run_id),
      created_at: r.created_at,
      horizon_start: Schema.decodeUnknownSync(IsoDate)(r.horizon_start),
      horizon_end: Schema.decodeUnknownSync(IsoDate)(r.horizon_end),
      status: Schema.decodeUnknownSync(ScheduleStatus)(r.status),
    }))
}

export function getScheduleRun(db: Db, runId: RunId): ScheduleRun | null {
  const row = db.select().from(schema.scheduleRun).where(eq(schema.scheduleRun.run_id, runId)).get()
  if (row === undefined) return null
  return {
    run_id: Schema.decodeUnknownSync(RunId)(row.run_id),
    created_at: row.created_at,
    horizon_start: Schema.decodeUnknownSync(IsoDate)(row.horizon_start),
    horizon_end: Schema.decodeUnknownSync(IsoDate)(row.horizon_end),
    status: Schema.decodeUnknownSync(ScheduleStatus)(row.status),
    planning_snapshot: strictDecode(PlanningState, row.planning_snapshot_json),
    compiled_scenario: strictDecode(ScheduleScenario, row.compiled_scenario_json),
    compiled_scenario_hash: row.compiled_scenario_hash,
    result: strictDecode(ScheduleResult, row.schedule_result_json),
    engine_version: row.engine_version,
    app_version: row.app_version,
    solver_backend: row.solver_backend,
  }
}
