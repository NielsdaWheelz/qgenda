import type { ScheduleScenario } from "../domain/scenario"
import type { ScheduleResult } from "../domain/schedule"

// Deterministic RFC-4180 CSV of a schedule, one row per assignment in result order. This helper owns
// CSV escaping for its boundary: a field is quoted (and internal quotes doubled) when it contains a
// comma, double-quote, CR, or LF.
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function scheduleCsv(result: ScheduleResult, scenario: ScheduleScenario): string {
  const nameOf = new Map(scenario.providers.map((p) => [p.id, p.display_name]))
  const header = "date,slot_id,slot_type,provider_id,provider_name,derived_call,weekend,holiday_id"
  const rows = result.assignments.map((a) => {
    const providerName = nameOf.get(a.provider_id)
    if (providerName === undefined)
      throw new Error(`export invariant: assignment references unknown provider ${a.provider_id}`)
    return [
      a.date,
      a.slot_id,
      a.slot_type,
      a.provider_id,
      providerName,
      String(a.derived_call),
      String(a.weekend),
      a.holiday_id ?? "",
    ]
      .map(csvField)
      .join(",")
  })
  return `${[header, ...rows].join("\r\n")}\r\n`
}
