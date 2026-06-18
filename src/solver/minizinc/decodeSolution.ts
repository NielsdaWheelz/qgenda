import { isFirstEquivalentSlot, isWeekend } from "../../domain/calendar"
import type { Assignment } from "../../domain/schedule"
import type { SolveInput } from "../Solver"

// Maps the solver's integer assign array (1-based PROV indexes over input.slots) back to branded-ID
// Assignments, re-deriving call/weekend/holiday facts from the calendar owner. Output is sorted by
// (date, slot order) for byte-stable results.
export function decodeAssignments(input: SolveInput, json: { assign: number[] }): Assignment[] {
  const { providers, days, weekend_blocks } = input.scenario
  const callRequired = new Set(days.filter((d) => d.call_required).map((d) => d.date))
  const holidayByDate = new Map(days.map((d) => [d.date, d.holiday_id]))

  // First-equivalent slot id per date: the assignment holding it carries derived call on a call-required day.
  const firstSlotByDate = new Map<string, string>()
  for (const slot of input.slots) {
    if (isFirstEquivalentSlot(slot.slot_type)) firstSlotByDate.set(slot.date, slot.slot_id)
  }

  return input.slots
    .map((slot, s) => {
      const providerIndex = json.assign[s]
      // justify-defect: assign has one entry per slot in 1..P; a missing/out-of-range index is solver/decode corruption.
      if (providerIndex === undefined) throw new Error(`no assignment for slot ${slot.slot_id}`)
      const provider = providers[providerIndex - 1]
      if (provider === undefined)
        throw new Error(`provider index ${providerIndex} out of range for slot ${slot.slot_id}`)
      const holiday_id = holidayByDate.get(slot.date)
      if (holiday_id === undefined) throw new Error(`no day demand for ${slot.date} (H_HORIZON_COMPLETE)`)
      return {
        date: slot.date,
        slot_id: slot.slot_id,
        slot_type: slot.slot_type,
        provider_id: provider.id,
        derived_call: callRequired.has(slot.date) && firstSlotByDate.get(slot.date) === slot.slot_id,
        weekend: isWeekend(slot.date, weekend_blocks),
        holiday_id,
        order: s,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
    .map(({ order: _order, ...assignment }) => assignment)
}
