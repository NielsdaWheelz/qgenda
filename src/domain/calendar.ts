import type { IsoDate, SlotType } from "./ids"
import type { DayDemand, Holiday, Provider, ScheduleScenario, WeekendBlock, Weights } from "./scenario"

// One owner for date classification and slot expansion. The solver, scorecard, and validation all
// derive weekend/holiday facts, call burden weights, and slots from here — never re-deriving them.

export function dayOfWeek(date: IsoDate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() // 0 = Sunday .. 6 = Saturday
}

export function isSemanticIsoDate(date: string): boolean {
  const t = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === date
}

export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  return Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)
}

export function eachDate(start: IsoDate, end: IsoDate): IsoDate[] {
  if (!isSemanticIsoDate(start) || !isSemanticIsoDate(end) || compareIsoDate(start, end) > 0) return []
  const dates: IsoDate[] = []
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10) as IsoDate)
  }
  return dates
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date("2026-01-01T00:00:00Z"))
    return true
  } catch {
    return false
  }
}

export function providerAvailableOn(provider: Provider, date: IsoDate): boolean {
  return (
    provider.active_from <= date &&
    (provider.active_until === null || date <= provider.active_until) &&
    !provider.unavailable_dates.includes(date)
  )
}

export type WeekendPeriod = {
  id: string
  dates: IsoDate[]
  split_required: boolean
  required_distinct_call_providers: number
  synthetic: boolean
}

export function weekendPeriods(
  horizon: ScheduleScenario["horizon"],
  configuredBlocks: readonly WeekendBlock[],
): WeekendPeriod[] {
  const configured: WeekendPeriod[] = configuredBlocks.map((block) => ({
    id: block.id,
    dates: [...block.dates],
    split_required: block.split_required,
    required_distinct_call_providers: block.required_distinct_call_providers,
    synthetic: false,
  }))
  const covered = new Set(configured.flatMap((block) => block.dates))
  const synthetic: WeekendPeriod[] = []
  const horizonDates = eachDate(horizon.start_date, horizon.end_date)
  for (let i = 0; i < horizonDates.length; i++) {
    const date = horizonDates[i]
    if (date === undefined || covered.has(date)) continue
    if (dayOfWeek(date) !== 6 && dayOfWeek(date) !== 0) continue
    const dates = [date]
    const next = horizonDates[i + 1]
    if (dayOfWeek(date) === 6 && next !== undefined && dayOfWeek(next) === 0 && !covered.has(next)) {
      dates.push(next)
      i++
    }
    synthetic.push({
      id: `synthetic_weekend:${dates[0]}`,
      dates,
      split_required: false,
      required_distinct_call_providers: 1,
      synthetic: true,
    })
  }
  return [...configured, ...synthetic].sort((a, b) =>
    compareIsoDate(a.dates[0] as IsoDate, b.dates[0] as IsoDate),
  )
}

// Weekend per spec: Saturday, Sunday, or any date listed in a weekend block (a block's Friday
// belongs to the block and is therefore a weekend).
export function isWeekend(date: IsoDate, blocks: readonly { dates: readonly IsoDate[] }[]): boolean {
  const dow = dayOfWeek(date)
  return dow === 0 || dow === 6 || blocks.some((b) => b.dates.includes(date))
}

// Burden weight of the derived call on a day. Holiday class wins, then weekend, then a block's
// Friday night, then ordinary weekday.
export function callBurdenWeight(
  day: DayDemand,
  holidays: readonly Holiday[],
  blocks: readonly { dates: readonly IsoDate[] }[],
  weights: Weights,
): number {
  if (day.holiday_id !== null) {
    const holiday = holidays.find((h) => h.id === day.holiday_id)
    // justify-defect: preflight guarantees day.holiday_id references an existing holiday.
    if (holiday === undefined) throw new Error(`unknown holiday ${day.holiday_id} on ${day.date}`)
    return holiday.class === "major" ? weights.major_holiday_call : weights.minor_holiday_call
  }
  const dow = dayOfWeek(day.date)
  if (dow === 0 || dow === 6) return weights.weekend_call
  if (dow === 5 && blocks.some((b) => b.dates.includes(day.date))) return weights.friday_night_call
  return weights.weekday_call
}

export type Slot = { date: IsoDate; slot_type: SlotType; slot_id: string }

export function isFirstEquivalentSlot(slotType: SlotType): boolean {
  return slotType === "normal_first" || slotType === "normal_first_last"
}

export function isLastEquivalentSlot(slotType: SlotType): boolean {
  return slotType === "normal_last" || slotType === "normal_first_last"
}

export function isSecondOrLastSlot(slotType: SlotType): boolean {
  return slotType === "normal_second" || isLastEquivalentSlot(slotType)
}

export function isCallRestrictedSlot(slotType: SlotType): boolean {
  return isFirstEquivalentSlot(slotType) || isSecondOrLastSlot(slotType)
}

export function isMiddleBurdenSlot(slotType: SlotType): boolean {
  return slotType === "normal_middle" || slotType === "eye_middle" || slotType === "dental_middle"
}

export function isEyeSlot(slotType: SlotType): boolean {
  return slotType === "eye_middle"
}

export function isDentalSlot(slotType: SlotType): boolean {
  return slotType === "dental_middle"
}

// Expand a day's demand into ordered slots: first-equivalent, second, middles, last, then eye and
// dental middle-equivalent slots. Repeated slot types carry a 1-based index in their slot_id.
export function expandDay(day: DayDemand): Slot[] {
  const types: SlotType[] = []
  const n = day.normal_list_slots
  if (n === 1) types.push("normal_first_last")
  else if (n >= 2) {
    types.push("normal_first")
    if (n >= 3) types.push("normal_second")
    for (let i = 0; i < n - (n >= 3 ? 3 : 2); i++) types.push("normal_middle")
    types.push("normal_last")
  }
  for (let i = 0; i < day.eye_slots; i++) types.push("eye_middle")
  for (let i = 0; i < day.dental_slots; i++) types.push("dental_middle")

  let middle = 0
  let eye = 0
  let dental = 0
  return types.map((slot_type) => {
    let slot_id: string
    if (slot_type === "normal_middle") slot_id = `${day.date}:normal_middle:${++middle}`
    else if (slot_type === "eye_middle") slot_id = `${day.date}:eye_middle:${++eye}`
    else if (slot_type === "dental_middle") slot_id = `${day.date}:dental_middle:${++dental}`
    else slot_id = `${day.date}:${slot_type}`
    return { date: day.date, slot_type, slot_id }
  })
}
