import { CompileDiagnostic } from "@qgenda/core/compiler/compileDiagnostics"
import { HolidayId, IsoDate, ProviderId, RunId } from "@qgenda/core/domain/ids"
import { OpeningLedger } from "@qgenda/core/domain/scenario"
import { ScheduleResult, ScheduleStatus } from "@qgenda/core/domain/schedule"
import type {
  DateDemandException,
  DemandTemplate,
  HolidayPlan,
  OpeningLedgerPlan,
  PlanningState,
  PlanningWorkspace,
  ProviderPlan,
  ProviderUnavailability,
  WeekendBlockPlan,
} from "@qgenda/core/planning/planningSchema"
import { Schema } from "effect"

// Forms edit the wire/encoded planning shapes as plain strings and numbers; the server reconstructs and
// validates the branded engine types on PUT, which is the single validation gate. Reusing the core
// schemas keeps one schema definition across client and server (no duplicates).
export type EditablePlanning = typeof PlanningState.Encoded
export type EditableWorkspace = typeof PlanningWorkspace.Encoded
export type EditableProvider = typeof ProviderPlan.Encoded
export type EditableUnavailability = typeof ProviderUnavailability.Encoded
export type EditableTemplate = typeof DemandTemplate.Encoded
export type EditableException = typeof DateDemandException.Encoded
export type EditableHoliday = typeof HolidayPlan.Encoded
export type EditableWeekendBlock = typeof WeekendBlockPlan.Encoded
export type EditableOpeningLedger = typeof OpeningLedgerPlan.Encoded

export const CompileResponse = Schema.Struct({
  status: Schema.Literal("valid"),
  scenario_hash: Schema.String,
  horizon: Schema.Struct({ start_date: IsoDate, end_date: IsoDate, timezone: Schema.String }),
  counts: Schema.Struct({
    days: Schema.Number,
    providers: Schema.Number,
    holidays: Schema.Number,
    weekend_blocks: Schema.Number,
  }),
  diagnostics: Schema.Array(CompileDiagnostic),
})
export type CompileResponse = typeof CompileResponse.Type

export const CompileError = Schema.Struct({
  status: Schema.Literal("invalid_input", "invalid_planning"),
  diagnostics: Schema.optionalWith(Schema.Array(CompileDiagnostic), { default: () => [] }),
  errors: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
})
export type CompileError = typeof CompileError.Type

export const PlanningError = Schema.Struct({
  status: Schema.Literal("invalid_planning"),
  diagnostics: Schema.optionalWith(Schema.Array(CompileDiagnostic), { default: () => [] }),
  errors: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
})

export const NotFoundError = Schema.Struct({
  status: Schema.Literal("not_found"),
  errors: Schema.Array(Schema.String),
})
export type NotFoundError = typeof NotFoundError.Type

export const RunSummary = Schema.Struct({
  run_id: RunId,
  created_at: Schema.String,
  horizon_start: IsoDate,
  horizon_end: IsoDate,
  status: ScheduleStatus,
})
export type RunSummary = typeof RunSummary.Type

export const RunDetail = Schema.Struct({
  run_id: RunId,
  created_at: Schema.String,
  horizon_start: IsoDate,
  horizon_end: IsoDate,
  status: ScheduleStatus,
  compiled_scenario_hash: Schema.String,
  opening_ledger_start_fresh: Schema.Boolean,
  opening_ledger: Schema.Array(OpeningLedger),
  days: Schema.Array(
    Schema.Struct({ date: IsoDate, holiday_id: Schema.NullOr(HolidayId), weekend: Schema.Boolean }),
  ),
  providers: Schema.Array(Schema.Struct({ id: ProviderId, display_name: Schema.String })),
  result: ScheduleResult,
})
export type RunDetail = typeof RunDetail.Type

export const CreatedRun = Schema.Struct({ run_id: RunId, status: ScheduleStatus, result: ScheduleResult })
export type CreatedRun = typeof CreatedRun.Type
