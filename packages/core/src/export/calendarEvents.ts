import { isDentalSlot, isEyeSlot } from "../domain/calendar"
import type { IsoDate, ProviderId, RunId, SlotType } from "../domain/ids"
import type { ScheduleScenario } from "../domain/scenario"
import type { ScheduleResult } from "../domain/schedule"

// One owner for turning assignments into shareable calendar events. CSV/ICS/HTML never re-derive a
// title or a uid from raw assignment fields — they read these.

export type CalendarEvent = {
  uid: string
  date: IsoDate
  title: string
  provider_id: ProviderId
  slot_type: SlotType
}

// Concise role-prefixed title. derived_call wins over the slot-kind prefix; otherwise eye/dental, else list.
function eventTitle(name: string, slotType: SlotType, derivedCall: boolean): string {
  if (derivedCall) return `Call: ${name}`
  if (isEyeSlot(slotType)) return `Eye: ${name}`
  if (isDentalSlot(slotType)) return `Dental: ${name}`
  return `List: ${name}`
}

export function calendarEvents(
  result: ScheduleResult,
  scenario: ScheduleScenario,
  runId: RunId,
): CalendarEvent[] {
  const nameOf = new Map(scenario.providers.map((p) => [p.id, p.display_name]))
  return result.assignments.map((a) => {
    const name = nameOf.get(a.provider_id)
    if (name === undefined)
      throw new Error(`export invariant: assignment references unknown provider ${a.provider_id}`)
    return {
      uid: `${runId}:${a.slot_id}`,
      date: a.date,
      title: eventTitle(name, a.slot_type, a.derived_call),
      provider_id: a.provider_id,
      slot_type: a.slot_type,
    }
  })
}
