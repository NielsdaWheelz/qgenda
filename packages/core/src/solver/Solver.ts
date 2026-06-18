import type { Slot } from "../domain/calendar"
import type { ScheduleScenario, SolverConfig, Weights } from "../domain/scenario"
import type { Assignment, FairnessTargets } from "../domain/schedule"

// Solver port. MiniZinc is isolated behind this function type so a different backend can replace it
// without touching scenario/result contracts. Expected failure modes are modeled as outcome
// variants, not thrown errors.
export type SolveInput = {
  scenario: ScheduleScenario
  slots: readonly Slot[]
  weights: Weights
  targets: FairnessTargets
  config: SolverConfig
}

export type SolveOutcome =
  | {
      _tag: "Solved"
      proven: boolean // true when the backend proved optimality
      assignments: Assignment[]
      objective: number
      backend: string
      status: string // raw backend status, e.g. "OPTIMAL_SOLUTION"
      wallSeconds: number
    }
  | { _tag: "Infeasible"; backend: string; status: string; wallSeconds: number }
  | { _tag: "Unavailable"; detail: string }
  | { _tag: "Unknown"; backend: string; status: string; wallSeconds: number }
  | { _tag: "OutputError"; detail: string; wallSeconds: number }

export type Solver = (input: SolveInput) => Promise<SolveOutcome>
