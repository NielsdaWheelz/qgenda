import { Schema } from "effect"

const StableIdText = Schema.String.pipe(Schema.pattern(/^[A-Za-z][A-Za-z0-9_:-]*$/))

export const ProviderId = StableIdText.pipe(Schema.brand("ProviderId"))
export type ProviderId = typeof ProviderId.Type

export const HolidayId = StableIdText.pipe(Schema.brand("HolidayId"))
export type HolidayId = typeof HolidayId.Type

export const WeekendBlockId = StableIdText.pipe(Schema.brand("WeekendBlockId"))
export type WeekendBlockId = typeof WeekendBlockId.Type

export const IsoDate = Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/), Schema.brand("IsoDate"))
export type IsoDate = typeof IsoDate.Type

// Identity of one immutable schedule-generation run (e.g. "run_2026_03_01_120000"). Minted by storage;
// referenced by the API, run review, and export UIDs, so it is owned in core to keep storage out of core.
export const RunId = StableIdText.pipe(Schema.brand("RunId"))
export type RunId = typeof RunId.Type

export const SlotType = Schema.Literal(
  "normal_first",
  "normal_second",
  "normal_middle",
  "normal_last",
  "normal_first_last",
  "eye_middle",
  "dental_middle",
)
export type SlotType = typeof SlotType.Type
