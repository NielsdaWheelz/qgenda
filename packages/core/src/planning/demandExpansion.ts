import { type CompileDiagnostic, compileError, compileWarning } from "../compiler/compileDiagnostics"
import { dayOfWeek, eachDate } from "../domain/calendar"
import type { IsoDate } from "../domain/ids"
import type { DateDemandException, DemandTemplate, Weekday } from "./planningSchema"

// Expand weekly demand templates and full-day exceptions into one demand per horizon date (spec
// "Demand Template", "Date Demand Exception"). A date resolves from its exception if one exists,
// otherwise from the single active template for its weekday; zero or multiple sources are errors. An
// exception is a complete full-day replacement, never a partial patch.

export type DayDemandFacts = {
  room_count: number
  normal_list_slots: number
  eye_slots: number
  dental_slots: number
  call_required: boolean
}

// dayOfWeek returns 0 = Sunday .. 6 = Saturday.
const WEEKDAY_OF_INDEX: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]

const factsOf = (d: DemandTemplate | DateDemandException): DayDemandFacts => ({
  room_count: d.room_count,
  normal_list_slots: d.normal_list_slots,
  eye_slots: d.eye_slots,
  dental_slots: d.dental_slots,
  call_required: d.call_required,
})

export function expandDemand(input: {
  templates: readonly DemandTemplate[]
  exceptions: readonly DateDemandException[]
  horizon: { start_date: IsoDate; end_date: IsoDate }
}): { demandByDate: Map<IsoDate, DayDemandFacts>; diagnostics: CompileDiagnostic[] } {
  const { templates, exceptions, horizon } = input
  const diagnostics: CompileDiagnostic[] = []
  const horizonDates = eachDate(horizon.start_date, horizon.end_date)
  const horizonSet = new Set<IsoDate>(horizonDates)

  const exceptionsByDate = new Map<IsoDate, DateDemandException[]>()
  for (const e of exceptions) {
    if (!horizonSet.has(e.date)) {
      diagnostics.push(
        compileWarning(
          "C_DATE_EXCEPTION_OUTSIDE_HORIZON",
          `Date exception ${e.exception_id} for ${e.date} is outside the horizon and was ignored.`,
          ["date_exceptions", e.exception_id],
          { date: e.date },
        ),
      )
      continue
    }
    const list = exceptionsByDate.get(e.date) ?? []
    list.push(e)
    exceptionsByDate.set(e.date, list)
  }

  const demandByDate = new Map<IsoDate, DayDemandFacts>()
  for (const date of horizonDates) {
    const dayExceptions = exceptionsByDate.get(date) ?? []
    const weekday = WEEKDAY_OF_INDEX[dayOfWeek(date)]
    const activeTemplates = templates.filter(
      (t) =>
        t.weekday === weekday && t.active_from <= date && (t.active_until === null || date <= t.active_until),
    )
    const [firstException] = dayExceptions
    const [firstTemplate, secondTemplate] = activeTemplates

    let facts: DayDemandFacts | undefined
    if (dayExceptions.length > 1)
      diagnostics.push(
        compileError(
          "C_MULTIPLE_DEMAND_TEMPLATES_FOR_DATE",
          `${date} has ${dayExceptions.length} date exceptions; a date must resolve to exactly one demand source.`,
          ["date_exceptions"],
          { date },
        ),
      )
    else if (firstException !== undefined) facts = factsOf(firstException)
    else if (firstTemplate === undefined)
      diagnostics.push(
        compileError(
          "C_MISSING_DEMAND_FOR_DATE",
          `No demand template or exception covers ${date}.`,
          ["demand"],
          { date },
        ),
      )
    else if (secondTemplate !== undefined)
      diagnostics.push(
        compileError(
          "C_MULTIPLE_DEMAND_TEMPLATES_FOR_DATE",
          `${date} (${weekday}) matches ${activeTemplates.length} active templates; exactly one is required.`,
          ["demand_templates"],
          { date },
        ),
      )
    else facts = factsOf(firstTemplate)

    if (facts === undefined) continue
    const demanded = facts.normal_list_slots + facts.eye_slots + facts.dental_slots
    if (demanded > facts.room_count) {
      diagnostics.push(
        compileError(
          "C_DEMAND_EXCEEDS_ROOM_COUNT",
          `${date} demands ${demanded} slots but room_count is ${facts.room_count}.`,
          ["demand"],
          { date },
        ),
      )
      continue
    }
    if (facts.call_required && facts.normal_list_slots === 0) {
      diagnostics.push(
        compileError(
          "C_CALL_REQUIRES_NORMAL_SLOT",
          `${date} requires call but has no ordinary list slot for deriving call.`,
          ["demand"],
          { date },
        ),
      )
      continue
    }
    demandByDate.set(date, facts)
  }
  return { demandByDate, diagnostics }
}
