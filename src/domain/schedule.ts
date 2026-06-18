import { Schema } from "effect"
import { HardRuleId, SoftRuleId } from "../rules/catalog"
import { HolidayId, IsoDate, ProviderId, SlotType } from "./ids"

export const ScheduleStatus = Schema.Literal(
  "optimal",
  "feasible",
  "infeasible",
  "invalid_input",
  "solver_error",
)
export type ScheduleStatus = typeof ScheduleStatus.Type

export const Assignment = Schema.Struct({
  date: IsoDate,
  slot_id: Schema.String,
  slot_type: SlotType,
  provider_id: ProviderId,
  derived_call: Schema.Boolean,
  weekend: Schema.Boolean,
  holiday_id: Schema.NullOr(HolidayId),
})
export type Assignment = typeof Assignment.Type

export const HardRuleViolation = Schema.Struct({
  rule_id: HardRuleId,
  detail: Schema.String,
})
export type HardRuleViolation = typeof HardRuleViolation.Type

// Per-provider fairness ledger row (see spec "Fairness Ledger").
export const LedgerRow = Schema.Struct({
  provider_id: ProviderId,
  fte: Schema.Number,
  workday_count: Schema.Int,
  call_count: Schema.Int,
  call_burden: Schema.Number,
  weekend_count: Schema.Int,
  weekend_burden: Schema.Number,
  holiday_count: Schema.Int,
  holiday_burden: Schema.Number,
  first_count: Schema.Int,
  second_count: Schema.Int,
  middle_count: Schema.Int,
  last_count: Schema.Int,
  eye_count: Schema.Int,
  dental_count: Schema.Int,
  target_call_burden: Schema.Number,
  call_delta: Schema.Number,
})
export type LedgerRow = typeof LedgerRow.Type

const LedgerStat = Schema.Struct({
  max: Schema.Number,
  min: Schema.Number,
  spread: Schema.Number,
  variance: Schema.Number,
})

const ClusterRow = Schema.Struct({
  provider_id: ProviderId,
  max_consecutive_workdays: Schema.Int,
  workday_run_distribution: Schema.Array(Schema.Int),
  weekend_blocks_assigned: Schema.Int,
  consecutive_weekend_blocks: Schema.Int,
  call_spacing_min: Schema.NullOr(Schema.Int),
  call_spacing_avg: Schema.NullOr(Schema.Number),
})

export const Scorecard = Schema.Struct({
  providers: Schema.Array(LedgerRow),
  aggregates: Schema.Struct({
    call_burden: LedgerStat,
    weekend_burden: LedgerStat,
    holiday_burden: LedgerStat,
    first_count: LedgerStat,
    second_count: LedgerStat,
    middle_count: LedgerStat,
    last_count: LedgerStat,
    eye_count: LedgerStat,
    dental_count: LedgerStat,
    workday_count: LedgerStat,
  }),
  largest_positive_delta: Schema.Number,
  largest_negative_delta: Schema.Number,
  excluded_pools: Schema.Struct({
    call: Schema.Array(ProviderId),
    eye: Schema.Array(ProviderId),
    dental: Schema.Array(ProviderId),
  }),
  clusters: Schema.Struct({
    consecutive_call_violations: Schema.Int,
    post_call_violations: Schema.Int,
    providers: Schema.Array(ClusterRow),
  }),
  objective_contributions: Schema.Record({ key: SoftRuleId, value: Schema.Number }),
})
export type Scorecard = typeof Scorecard.Type

// FTE-normalized fairness targets per provider. Computed once by scorecard/ledger.ts#fairnessTargets
// and consumed by both the solver objective and the scorecard ledger, so there is one owner.
export type ProviderTargets = {
  call: number
  weekend: number
  holiday: number
  first: number
  second: number
  middle: number
  last: number
  eye: number
  dental: number
  workday: number
}
export type FairnessTargets = Map<ProviderId, ProviderTargets>

export const ScheduleResult = Schema.Struct({
  schema_version: Schema.Literal("v0.1"),
  scenario_id: Schema.String,
  status: ScheduleStatus,
  scenario_hash: Schema.String,
  solver: Schema.Struct({
    engine: Schema.Literal("minizinc"),
    backend: Schema.String,
    status: Schema.String,
    objective_value: Schema.NullOr(Schema.Number),
    wall_time_seconds: Schema.Number,
  }),
  assignments: Schema.Array(Assignment),
  hard_rule_report: Schema.Struct({
    violation_count: Schema.Int,
    violations: Schema.Array(HardRuleViolation),
  }),
  scorecard: Scorecard,
  warnings: Schema.Array(Schema.String),
})
export type ScheduleResult = typeof ScheduleResult.Type
