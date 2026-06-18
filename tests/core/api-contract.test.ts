import { expect, test } from "bun:test"
import { generateScheduleWithSolver } from "@qgenda/core/api/generateSchedule"
import type { Assignment } from "@qgenda/core/domain/schedule"
import type { SolveOutcome, Solver } from "@qgenda/core/solver/Solver"

const scenario = {
  schema_version: "v0.1",
  scenario_id: "api-contract",
  horizon: { start_date: "2026-06-17", end_date: "2026-06-17", timezone: "UTC" },
  providers: [
    {
      id: "p1",
      display_name: "Provider One",
      fte: 1,
      call_eligible: true,
      eye_eligible: false,
      dental_eligible: false,
      active_from: "2026-01-01",
      active_until: null,
      unavailable_dates: [],
    },
  ],
  days: [
    {
      date: "2026-06-17",
      room_count: 1,
      normal_list_slots: 1,
      eye_slots: 0,
      dental_slots: 0,
      call_required: false,
      holiday_id: null,
      weekend_block_id: null,
    },
  ],
  holidays: [],
  weekend_blocks: [],
  opening_ledger: [],
  rules: {},
  solver: { max_seconds: 30, random_seed: 1, allow_feasible_result: false },
}

const assignment: Assignment = {
  date: "2026-06-17" as Assignment["date"],
  slot_id: "2026-06-17:normal_first_last",
  slot_type: "normal_first_last",
  provider_id: "p1" as Assignment["provider_id"],
  derived_call: false,
  weekend: false,
  holiday_id: null,
}

type SolvedOutcome = Extract<SolveOutcome, { _tag: "Solved" }>

const solver =
  (overrides: Partial<Omit<SolvedOutcome, "_tag">>): Solver =>
  async (): Promise<SolvedOutcome> => ({
    _tag: "Solved",
    proven: true,
    assignments: [assignment],
    objective: 0,
    backend: "test",
    status: "OPTIMAL_SOLUTION",
    wallSeconds: 0,
    ...overrides,
  })

test("unproven feasible solver output is rejected unless allow_feasible_result is true", async () => {
  const rejected = await generateScheduleWithSolver(scenario, solver({ proven: false, status: "UNKNOWN" }))
  expect(rejected.status).toBe("solver_error")
  expect(rejected.assignments).toEqual([])

  const accepted = await generateScheduleWithSolver(
    { ...scenario, solver: { ...scenario.solver, allow_feasible_result: true } },
    solver({ proven: false, status: "UNKNOWN" }),
  )
  expect(accepted.status).toBe("feasible")
  expect(accepted.assignments).toEqual([assignment])
})

test("postsolve failure returns solver_error without leaking assignments", async () => {
  const badAssignment = { ...assignment, derived_call: true }
  const result = await generateScheduleWithSolver(
    scenario,
    solver({ assignments: [badAssignment], objective: 1, status: "OPTIMAL_SOLUTION" }),
  )
  expect(result.status).toBe("solver_error")
  expect(result.assignments).toEqual([])
  expect(result.hard_rule_report.violation_count).toBeGreaterThan(0)
})
