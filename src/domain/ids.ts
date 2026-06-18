import { Schema } from "effect"

export const ProviderId = Schema.String.pipe(Schema.brand("ProviderId"))
export type ProviderId = typeof ProviderId.Type

export const HolidayId = Schema.String.pipe(Schema.brand("HolidayId"))
export type HolidayId = typeof HolidayId.Type

export const WeekendBlockId = Schema.String.pipe(Schema.brand("WeekendBlockId"))
export type WeekendBlockId = typeof WeekendBlockId.Type

export const IsoDate = Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/), Schema.brand("IsoDate"))
export type IsoDate = typeof IsoDate.Type

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
