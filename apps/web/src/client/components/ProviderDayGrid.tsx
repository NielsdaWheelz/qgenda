import { eachDate } from "@qgenda/core/domain/calendar"
import type { IsoDate } from "@qgenda/core/domain/ids"
import type { Assignment, ScheduleResult } from "@qgenda/core/domain/schedule"
import { providerLabel } from "../labels"

// Display-only provider-by-day matrix for run review. It groups stored assignments by provider/date and
// renders slot labels from the result; it never creates, edits, or recomputes assignments.
export function ProviderDayGrid({
  result,
  providers,
  horizon,
}: {
  result: ScheduleResult
  providers: readonly { id: string; display_name: string }[]
  horizon: { start_date: string; end_date: string }
}) {
  const days = eachDate(horizon.start_date as IsoDate, horizon.end_date as IsoDate)
  const byProviderDate = new Map<string, Assignment[]>()
  for (const assignment of result.assignments) {
    const key = `${assignment.provider_id}:${assignment.date}`
    const list = byProviderDate.get(key)
    if (list === undefined) byProviderDate.set(key, [assignment])
    else list.push(assignment)
  }

  return (
    <div>
      <h2>Provider by day</h2>
      <div className="wide-table">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              {days.map((date) => (
                <th key={date}>{date}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id}>
                <th>{providerLabel(providers, provider.id)}</th>
                {days.map((date) => {
                  const assignments = byProviderDate.get(`${provider.id}:${date}`) ?? []
                  return (
                    <td key={date}>
                      {assignments.map((assignment) => (
                        <span key={assignment.slot_id} className="assignment-chip">
                          {assignment.derived_call ? "call" : assignment.slot_type}
                        </span>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
