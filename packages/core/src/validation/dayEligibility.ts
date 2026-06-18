import { expandDay, isCallRestrictedSlot, isWeekend, providerAvailableOn } from "../domain/calendar"
import { providerCanCoverSlot } from "../domain/eligibility"
import type { DayDemand, Provider, WeekendBlock } from "../domain/scenario"

export type DayEligibilitySummary = {
  total_slots: number
  call_restricted_slots: number
  call_eligible_available: number
  eye_eligible_available: number
  dental_eligible_available: number
  can_cover_all_slots: boolean
}

export function summarizeDayEligibility(
  day: DayDemand,
  providers: readonly Provider[],
  weekendBlocks: readonly WeekendBlock[],
): DayEligibilitySummary {
  const slots = expandDay(day)
  const weekendOrHoliday = isWeekend(day.date, weekendBlocks) || day.holiday_id !== null
  const available = providers.filter((p) => providerAvailableOn(p, day.date))
  const eligibleBySlot = slots.map((slot) =>
    available.filter((provider) => providerCanCoverSlot(provider, slot, day, weekendBlocks)).map((p) => p.id),
  )

  return {
    total_slots: slots.length,
    call_restricted_slots: slots.filter((slot) => isCallRestrictedSlot(slot.slot_type)).length,
    call_eligible_available: available.filter((p) => p.call_eligible).length,
    eye_eligible_available: available.filter((p) => p.eye_eligible && (!weekendOrHoliday || p.call_eligible))
      .length,
    dental_eligible_available: available.filter(
      (p) => p.dental_eligible && (!weekendOrHoliday || p.call_eligible),
    ).length,
    can_cover_all_slots: hasDistinctProviderMatching(eligibleBySlot),
  }
}

function hasDistinctProviderMatching(eligibleBySlot: readonly (readonly string[])[]): boolean {
  const matchedProviderToSlot = new Map<string, number>()
  const visit = (slotIndex: number, seen: Set<string>): boolean => {
    for (const providerId of eligibleBySlot[slotIndex] ?? []) {
      if (seen.has(providerId)) continue
      seen.add(providerId)
      const previousSlot = matchedProviderToSlot.get(providerId)
      if (previousSlot === undefined || visit(previousSlot, seen)) {
        matchedProviderToSlot.set(providerId, slotIndex)
        return true
      }
    }
    return false
  }
  return eligibleBySlot.every((_, slotIndex) => visit(slotIndex, new Set()))
}
