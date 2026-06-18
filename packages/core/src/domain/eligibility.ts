import {
  isCallRestrictedSlot,
  isDentalSlot,
  isEyeSlot,
  isWeekend,
  providerAvailableOn,
  type Slot,
} from "./calendar"
import type { DayDemand, Provider, WeekendBlock } from "./scenario"

// Single provider/date/slot eligibility predicate. Hard-rule validation, solver prechecks, and
// fairness exposure targets all use this so audit math cannot drift from legal assignability.
export function providerCanCoverSlot(
  provider: Provider,
  slot: Slot,
  day: DayDemand,
  weekendBlocks: readonly WeekendBlock[],
): boolean {
  if (!providerAvailableOn(provider, day.date)) return false
  if (
    (isCallRestrictedSlot(slot.slot_type) || isWeekend(day.date, weekendBlocks) || day.holiday_id !== null) &&
    !provider.call_eligible
  )
    return false
  if (isEyeSlot(slot.slot_type) && !provider.eye_eligible) return false
  if (isDentalSlot(slot.slot_type) && !provider.dental_eligible) return false
  return true
}
