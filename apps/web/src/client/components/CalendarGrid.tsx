import { eachDate, isDentalSlot, isEyeSlot } from "@qgenda/core/domain/calendar"
import type { IsoDate } from "@qgenda/core/domain/ids"
import type { Assignment, ScheduleResult } from "@qgenda/core/domain/schedule"
import { providerLabel } from "../labels"

type CalendarDayFact = {
  date: IsoDate
  holiday_id: string | null
  weekend: boolean
}

// Display-only month grid: groups and formats the run's assignments. It reads assignment fields only and
// never recomputes rule truth or fairness (weekend/holiday/call come straight off each assignment).
export function CalendarGrid({
  result,
  providers,
  horizon,
  days: dayFacts,
}: {
  result: ScheduleResult
  providers: readonly { id: string; display_name: string }[]
  horizon: { start_date: string; end_date: string }
  days?: readonly CalendarDayFact[]
}) {
  const byDate = new Map<string, Assignment[]>()
  for (const a of result.assignments) {
    const day = byDate.get(a.date)
    if (day === undefined) byDate.set(a.date, [a])
    else day.push(a)
  }
  const days = eachDate(horizon.start_date as IsoDate, horizon.end_date as IsoDate)
  const factsByDate = new Map(dayFacts?.map((day) => [day.date, day]))
  return (
    <div className="calendar">
      {days.map((date) => {
        const cell = byDate.get(date) ?? []
        const fact = factsByDate.get(date)
        const weekend = fact?.weekend ?? cell.some((a) => a.weekend)
        const holiday = (fact?.holiday_id ?? null) !== null || cell.some((a) => a.holiday_id !== null)
        const className = `cell${holiday ? " holiday" : weekend ? " weekend" : ""}`
        return (
          <div key={date} className={className}>
            <div className="date">{date}</div>
            {holiday && <span className="tag holiday">holiday</span>}
            {weekend && !holiday && <span className="tag weekend">weekend</span>}
            {cell.map((a) => (
              <div key={a.slot_id} className="assignment">
                {a.derived_call && <span className="tag call">call</span>}
                {isEyeSlot(a.slot_type) && <span className="tag eye">eye</span>}
                {isDentalSlot(a.slot_type) && <span className="tag dental">dental</span>}
                {providerLabel(providers, a.provider_id)}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
