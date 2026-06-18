import { createHash } from "node:crypto"
import { Either, Schema } from "effect"
import { ArrayFormatter } from "effect/ParseResult"
import { expandDay } from "../domain/calendar"
import type { SolverConfig, Weights } from "../domain/scenario"
import { ScheduleScenario, SOLVER_DEFAULTS } from "../domain/scenario"
import type {
  Assignment,
  HardRuleViolation,
  ScheduleResult,
  ScheduleStatus,
  Scorecard,
} from "../domain/schedule"
import { DEFAULT_WEIGHTS } from "../rules/weights"
import { fairnessTargets } from "../scorecard/ledger"
import { buildScorecard, emptyScorecard } from "../scorecard/scorecard"
import { solveWithMiniZinc } from "../solver/minizinc/MiniZincSolver"
import type { Solver } from "../solver/Solver"
import { postsolve } from "../validation/postsolve"
import { preflight } from "../validation/preflight"

// Product capability: decode → preflight → solve → postsolve → scorecard. Owns no scenario/result
// file IO and makes no network calls. Every expected failure (bad input, infeasible, solver problem)
// is returned as a ScheduleResult with the matching status — this function does not throw for those.
export async function generateSchedule(request: unknown): Promise<ScheduleResult> {
  return generateScheduleWithSolver(request, solveWithMiniZinc)
}

export async function generateScheduleWithSolver(
  request: unknown,
  solverAdapter: Solver,
): Promise<ScheduleResult> {
  const decoded = Schema.decodeUnknownEither(ScheduleScenario)(request, { onExcessProperty: "error" })
  if (Either.isLeft(decoded)) {
    const warnings = ArrayFormatter.formatErrorSync(decoded.left).map(
      (i) => `INVALID_INPUT: ${i.path.join(".") || "(root)"}: ${i.message}`,
    )
    return result({
      scenario_id: scenarioIdOf(request),
      status: "invalid_input",
      scenario_hash: hashOf(request),
      warnings,
    })
  }

  const scenario = decoded.right
  const hash = hashOf(scenario)
  // justify-type-assertion: Schema.partial omits absent keys at runtime (JSON has no `undefined`), so
  // spreading the present numeric overrides over the complete defaults yields a full value; the
  // `| undefined` is a partial-type artifact only.
  const weights = { ...DEFAULT_WEIGHTS, ...scenario.weights } as Weights
  const config = { ...SOLVER_DEFAULTS, ...scenario.solver } as SolverConfig

  const preErrors = preflight(scenario, weights)
  if (preErrors.length > 0) {
    return result({
      scenario_id: scenario.scenario_id,
      status: "invalid_input",
      scenario_hash: hash,
      warnings: preErrors,
    })
  }

  const slots = scenario.days.flatMap(expandDay)
  const targets = fairnessTargets(scenario, slots, weights)
  const outcome = await solverAdapter({ scenario, slots, weights, targets, config })

  switch (outcome._tag) {
    case "Unavailable":
      return result({
        scenario_id: scenario.scenario_id,
        status: "solver_error",
        scenario_hash: hash,
        warnings: [`SOLVER_UNAVAILABLE: ${outcome.detail}`],
      })
    case "OutputError":
      return result({
        scenario_id: scenario.scenario_id,
        status: "solver_error",
        scenario_hash: hash,
        solver: solverInfo("", "", null, outcome.wallSeconds),
        warnings: [`SOLVER_ERROR: ${outcome.detail}`],
      })
    case "Unknown":
      return result({
        scenario_id: scenario.scenario_id,
        status: "solver_error",
        scenario_hash: hash,
        solver: solverInfo(outcome.backend, outcome.status, null, outcome.wallSeconds),
        warnings: ["SOLVER_ERROR: solver returned no solution within the time limit"],
      })
    case "Infeasible":
      return result({
        scenario_id: scenario.scenario_id,
        status: "infeasible",
        scenario_hash: hash,
        solver: solverInfo(outcome.backend, outcome.status, null, outcome.wallSeconds),
        warnings: ["INFEASIBLE: no schedule satisfies the hard constraints"],
      })
    case "Solved": {
      const solver = solverInfo(outcome.backend, outcome.status, outcome.objective, outcome.wallSeconds)
      const violations = postsolve(scenario, slots, weights, outcome.assignments)
      if (violations.length > 0) {
        return result({
          scenario_id: scenario.scenario_id,
          status: "solver_error",
          scenario_hash: hash,
          solver,
          hard_rule_report: { violation_count: violations.length, violations },
          warnings: ["SOLVER_ERROR: solver output violated hard rules (see hard_rule_report)"],
        })
      }
      if (!outcome.proven && !config.allow_feasible_result) {
        return result({
          scenario_id: scenario.scenario_id,
          status: "solver_error",
          scenario_hash: hash,
          solver,
          warnings: [
            "SOLVER_ERROR: solver found only an unproven feasible solution, and allow_feasible_result is false",
          ],
        })
      }
      return result({
        scenario_id: scenario.scenario_id,
        status: outcome.proven ? "optimal" : "feasible",
        scenario_hash: hash,
        solver,
        assignments: outcome.assignments,
        scorecard: buildScorecard(scenario, slots, weights, targets, outcome.assignments),
        warnings: [],
      })
    }
  }
}

function solverInfo(
  backend: string,
  status: string,
  objective_value: number | null,
  wall_time_seconds: number,
): ScheduleResult["solver"] {
  return { engine: "minizinc", backend, status, objective_value, wall_time_seconds }
}

// Single result builder; absent fields take their empty/no-schedule defaults.
function result(fields: {
  scenario_id: string
  status: ScheduleStatus
  scenario_hash: string
  solver?: ScheduleResult["solver"]
  assignments?: Assignment[]
  hard_rule_report?: { violation_count: number; violations: HardRuleViolation[] }
  scorecard?: Scorecard
  warnings: string[]
}): ScheduleResult {
  return {
    schema_version: "v0.1",
    scenario_id: fields.scenario_id,
    status: fields.status,
    scenario_hash: fields.scenario_hash,
    solver: fields.solver ?? solverInfo("", "", null, 0),
    assignments: fields.assignments ?? [],
    hard_rule_report: fields.hard_rule_report ?? { violation_count: 0, violations: [] },
    scorecard: fields.scorecard ?? emptyScorecard(),
    warnings: fields.warnings,
  }
}

function scenarioIdOf(request: unknown): string {
  return typeof request === "object" &&
    request !== null &&
    "scenario_id" in request &&
    typeof request.scenario_id === "string"
    ? request.scenario_id
    : "unknown"
}

// sha256 over the request with object keys sorted at every level, so logically equal scenarios hash equally.
function hashOf(value: unknown): string {
  const canonical = JSON.stringify(value, (_k, v) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  )
  return `sha256:${createHash("sha256")
    .update(canonical ?? "")
    .digest("hex")}`
}
