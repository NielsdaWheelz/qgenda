import { Schema } from "effect"
import { HolidayId, IsoDate, ProviderId, WeekendBlockId } from "../domain/ids"
import { SolverConfig } from "../domain/scenario"

// Human-facing planning contracts (spec "Planning Domain Model"). These are the source of truth a
// scheduler edits through forms; the compiler turns a PlanningState + GenerationRequest into the engine
// ScheduleScenario. Wire format is snake_case, matching the engine and the persistence tables. Every
// JSON boundary (PUT /planning, storage decode) decodes these with onExcessProperty: "error".

const NonNegInt = Schema.Int.pipe(Schema.greaterThanOrEqualTo(0))
const Fte = Schema.Number.pipe(Schema.greaterThan(0), Schema.lessThanOrEqualTo(1))
const StablePlanningId = Schema.String.pipe(Schema.pattern(/^[A-Za-z][A-Za-z0-9_:-]*$/))

export const UnavailabilityId = StablePlanningId.pipe(Schema.brand("UnavailabilityId"))
export type UnavailabilityId = typeof UnavailabilityId.Type
export const TemplateId = StablePlanningId.pipe(Schema.brand("TemplateId"))
export type TemplateId = typeof TemplateId.Type
export const ExceptionId = StablePlanningId.pipe(Schema.brand("ExceptionId"))
export type ExceptionId = typeof ExceptionId.Type

export const Weekday = Schema.Literal(
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
)
export type Weekday = typeof Weekday.Type

export const PlanningWorkspace = Schema.Struct({
  schema_version: Schema.Literal("v0.2"),
  workspace_id: Schema.Literal("local"),
  timezone: Schema.String,
  active_cycle_start: IsoDate,
  active_cycle_end: IsoDate,
  opening_ledger_start_fresh: Schema.Boolean,
})
export type PlanningWorkspace = typeof PlanningWorkspace.Type

export const ProviderPlan = Schema.Struct({
  provider_id: ProviderId,
  display_name: Schema.String,
  fte: Fte,
  call_eligible: Schema.Boolean,
  eye_eligible: Schema.Boolean,
  dental_eligible: Schema.Boolean,
  active_from: IsoDate,
  active_until: Schema.NullOr(IsoDate),
})
export type ProviderPlan = typeof ProviderPlan.Type

export const ProviderUnavailability = Schema.Struct({
  unavailability_id: UnavailabilityId,
  provider_id: ProviderId,
  start_date: IsoDate,
  end_date: IsoDate,
  kind: Schema.Literal("vacation", "conference", "leave", "other"),
  label: Schema.String,
})
export type ProviderUnavailability = typeof ProviderUnavailability.Type

export const DemandTemplate = Schema.Struct({
  template_id: TemplateId,
  weekday: Weekday,
  room_count: NonNegInt,
  normal_list_slots: NonNegInt,
  eye_slots: NonNegInt,
  dental_slots: NonNegInt,
  call_required: Schema.Boolean,
  active_from: IsoDate,
  active_until: Schema.NullOr(IsoDate),
})
export type DemandTemplate = typeof DemandTemplate.Type

export const DateDemandException = Schema.Struct({
  exception_id: ExceptionId,
  date: IsoDate,
  room_count: NonNegInt,
  normal_list_slots: NonNegInt,
  eye_slots: NonNegInt,
  dental_slots: NonNegInt,
  call_required: Schema.Boolean,
  label: Schema.String,
})
export type DateDemandException = typeof DateDemandException.Type

export const HolidayPlan = Schema.Struct({
  holiday_id: HolidayId,
  date: IsoDate,
  label: Schema.String,
  class: Schema.Literal("major", "minor"),
  weekend_block_id: Schema.NullOr(WeekendBlockId),
})
export type HolidayPlan = typeof HolidayPlan.Type

export const WeekendBlockPlan = Schema.Struct({
  weekend_block_id: WeekendBlockId,
  label: Schema.String,
  dates: Schema.NonEmptyArray(IsoDate),
  split_required: Schema.Boolean,
  required_distinct_call_providers: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
})
export type WeekendBlockPlan = typeof WeekendBlockPlan.Type

export const OpeningLedgerPlan = Schema.Struct({
  provider_id: ProviderId,
  cycle_start: IsoDate,
  as_of_date: IsoDate,
  call_burden: Schema.Number,
  weekend_burden: Schema.Number,
  holiday_burden: Schema.Number,
  first_count: NonNegInt,
  second_count: NonNegInt,
  middle_count: NonNegInt,
  last_count: NonNegInt,
  eye_count: NonNegInt,
  dental_count: NonNegInt,
})
export type OpeningLedgerPlan = typeof OpeningLedgerPlan.Type

// Whole editable planning state for the one local workspace (GET/PUT /planning).
export const PlanningState = Schema.Struct({
  workspace: PlanningWorkspace,
  providers: Schema.Array(ProviderPlan),
  unavailability: Schema.Array(ProviderUnavailability),
  demand_templates: Schema.Array(DemandTemplate),
  date_exceptions: Schema.Array(DateDemandException),
  holidays: Schema.Array(HolidayPlan),
  weekend_blocks: Schema.Array(WeekendBlockPlan),
  opening_ledger: Schema.Array(OpeningLedgerPlan),
})
export type PlanningState = typeof PlanningState.Type

// One generation run's horizon and solver settings (the body of POST /scenarios/compile and
// /schedule-runs). Timezone comes from the workspace, not the request.
export const GenerationRequest = Schema.Struct({
  horizon: Schema.Struct({ start_date: IsoDate, end_date: IsoDate }),
  solver: Schema.optionalWith(Schema.partial(SolverConfig), { default: () => ({}) }),
})
export type GenerationRequest = typeof GenerationRequest.Type
