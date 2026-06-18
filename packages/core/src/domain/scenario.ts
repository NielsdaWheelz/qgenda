import { Schema } from "effect"
import { HolidayId, IsoDate, ProviderId, WeekendBlockId } from "./ids"

const NonNegInt = Schema.Int.pipe(Schema.greaterThanOrEqualTo(0))
const NonNegNumber = Schema.Number.pipe(Schema.greaterThanOrEqualTo(0))
const PositiveNumber = Schema.Number.pipe(Schema.greaterThan(0))

export const Provider = Schema.Struct({
  id: ProviderId,
  display_name: Schema.String,
  fte: Schema.Number.pipe(Schema.greaterThan(0), Schema.lessThanOrEqualTo(1)),
  call_eligible: Schema.Boolean,
  eye_eligible: Schema.Boolean,
  dental_eligible: Schema.Boolean,
  active_from: IsoDate,
  active_until: Schema.NullOr(IsoDate),
  unavailable_dates: Schema.optionalWith(Schema.Array(IsoDate), { default: () => [] }),
})
export type Provider = typeof Provider.Type

export const DayDemand = Schema.Struct({
  date: IsoDate,
  room_count: NonNegInt,
  normal_list_slots: NonNegInt,
  eye_slots: NonNegInt,
  dental_slots: NonNegInt,
  call_required: Schema.Boolean,
  holiday_id: Schema.NullOr(HolidayId),
  weekend_block_id: Schema.NullOr(WeekendBlockId),
  notes: Schema.optional(Schema.String),
})
export type DayDemand = typeof DayDemand.Type

export const Holiday = Schema.Struct({
  id: HolidayId,
  date: IsoDate,
  label: Schema.String,
  class: Schema.Literal("major", "minor"),
  weekend_block_id: Schema.NullOr(WeekendBlockId),
})
export type Holiday = typeof Holiday.Type

export const WeekendBlock = Schema.Struct({
  id: WeekendBlockId,
  dates: Schema.NonEmptyArray(IsoDate),
  split_required: Schema.Boolean,
  required_distinct_call_providers: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
})
export type WeekendBlock = typeof WeekendBlock.Type

export const OpeningLedger = Schema.Struct({
  provider_id: ProviderId,
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
export type OpeningLedger = typeof OpeningLedger.Type

export const Weights = Schema.Struct({
  weekday_call: NonNegNumber,
  friday_night_call: NonNegNumber,
  weekend_call: NonNegNumber,
  minor_holiday_call: NonNegNumber,
  major_holiday_call: NonNegNumber,
  first_position: NonNegNumber,
  second_position: NonNegNumber,
  middle_position: NonNegNumber,
  last_position: NonNegNumber,
  eye_slot: NonNegNumber,
  dental_slot: NonNegNumber,
})
export type Weights = typeof Weights.Type

export const SolverConfig = Schema.Struct({
  max_seconds: PositiveNumber,
  random_seed: Schema.Int,
  allow_feasible_result: Schema.Boolean,
})
export type SolverConfig = typeof SolverConfig.Type
export type SolverConfigOverrides = {
  readonly max_seconds?: number | undefined
  readonly random_seed?: number | undefined
  readonly allow_feasible_result?: boolean | undefined
}

export const SOLVER_DEFAULTS: SolverConfig = { max_seconds: 30, random_seed: 1, allow_feasible_result: false }

export function resolveSolverConfig(overrides: SolverConfigOverrides): SolverConfig {
  // justify-type-assertion: Effect Schema partial values omit absent keys at JSON boundaries; spreading
  // present overrides over the complete defaults yields the full runtime shape.
  return { ...SOLVER_DEFAULTS, ...overrides } as SolverConfig
}

export const ScheduleScenario = Schema.Struct({
  schema_version: Schema.Literal("v0.1"),
  scenario_id: Schema.String,
  horizon: Schema.Struct({
    start_date: IsoDate,
    end_date: IsoDate,
    timezone: Schema.String,
  }),
  providers: Schema.Array(Provider),
  days: Schema.Array(DayDemand),
  holidays: Schema.optionalWith(Schema.Array(Holiday), { default: () => [] }),
  weekend_blocks: Schema.optionalWith(Schema.Array(WeekendBlock), { default: () => [] }),
  opening_ledger: Schema.optionalWith(Schema.Array(OpeningLedger), { default: () => [] }),
  rules: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.Never }), {
    default: () => ({}),
  }),
  weights: Schema.optionalWith(Schema.partial(Weights), { default: () => ({}) }),
  solver: Schema.optionalWith(Schema.partial(SolverConfig), { default: () => ({}) }),
})
export type ScheduleScenario = typeof ScheduleScenario.Type
