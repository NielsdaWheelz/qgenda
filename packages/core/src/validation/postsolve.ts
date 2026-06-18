import type { Slot } from "../domain/calendar"
import {
  eachDate,
  isDentalSlot,
  isEyeSlot,
  isFirstEquivalentSlot,
  isSecondOrLastSlot,
  isWeekend,
  providerAvailableOn,
} from "../domain/calendar"
import type { IsoDate } from "../domain/ids"
import type { ScheduleScenario, Weights } from "../domain/scenario"
import type { Assignment, HardRuleViolation } from "../domain/schedule"

// Independent post-solve hard-rule check. Re-derives every fact (call, weekend, holiday, eligibility)
// from (date, slot_type, provider_id) + scenario + calendar; it never trusts an assignment's own
// derived_call/weekend/holiday_id flags. Returns [] when the schedule satisfies every hard rule.
// `weights` is unused here (burden weights only affect the soft objective, not hard validity) but is
// part of the validation contract.
export function postsolve(
  scenario: ScheduleScenario,
  slots: readonly Slot[],
  _weights: Weights,
  assignments: readonly Assignment[],
): HardRuleViolation[] {
  const violations: HardRuleViolation[] = []

  const providerById = new Map(scenario.providers.map((p) => [p.id, p]))
  const dayByDate = new Map(scenario.days.map((d) => [d.date, d]))
  const horizon = eachDate(scenario.horizon.start_date, scenario.horizon.end_date)
  const slotById = new Map(slots.map((slot) => [slot.slot_id, slot]))

  const assignmentsByDate = new Map<IsoDate, Assignment[]>()
  for (const a of assignments) {
    const list = assignmentsByDate.get(a.date)
    if (list === undefined) assignmentsByDate.set(a.date, [a])
    else list.push(a)
  }

  // Shared call derivation, reused by the consecutive / post-call / weekend-block checks. A provider
  // holds call on date d iff day d is call_required and they hold that day's first-equivalent slot.
  const callKey = (providerId: string, date: IsoDate) => `${providerId}|${date}`
  const hasCall = new Set<string>()
  for (const a of assignments) {
    const slot = slotById.get(a.slot_id)
    if (slot === undefined || !isFirstEquivalentSlot(slot.slot_type)) continue
    if (dayByDate.get(a.date)?.call_required === true) hasCall.add(callKey(a.provider_id, a.date))
  }

  // H_HORIZON_COMPLETE: every horizon date has a day entry.
  for (const date of horizon) {
    if (!dayByDate.has(date))
      violations.push({ rule_id: "H_HORIZON_COMPLETE", detail: `no day demand for ${date}` })
  }

  for (const day of scenario.days) {
    if (
      day.call_required &&
      !slots.some((slot) => slot.date === day.date && isFirstEquivalentSlot(slot.slot_type))
    )
      violations.push({
        rule_id: "H_CALL_REQUIRES_FIRST_SLOT",
        detail: `${day.date} is call_required but has no first-equivalent slot`,
      })
  }

  // H_COVER_ALL_SLOTS: assignment slot_ids equal the expected set exactly (each assigned once; no
  // unknown or duplicate slot_id).
  const expected = new Set(slots.map((s) => s.slot_id))
  const seen = new Set<string>()
  for (const a of assignments) {
    if (!expected.has(a.slot_id))
      violations.push({
        rule_id: "H_COVER_ALL_SLOTS",
        detail: `unknown slot_id ${a.slot_id} assigned to ${a.provider_id}`,
      })
    else if (seen.has(a.slot_id))
      violations.push({
        rule_id: "H_COVER_ALL_SLOTS",
        detail: `slot_id ${a.slot_id} assigned more than once`,
      })
    else {
      const slot = slotById.get(a.slot_id)
      if (slot !== undefined && (a.date !== slot.date || a.slot_type !== slot.slot_type))
        violations.push({
          rule_id: "H_COVER_ALL_SLOTS",
          detail: `slot_id ${a.slot_id} metadata mismatch: assignment has ${a.date}/${a.slot_type}, expected ${slot.date}/${slot.slot_type}`,
        })
    }
    seen.add(a.slot_id)
  }
  for (const slotId of expected) {
    if (!seen.has(slotId))
      violations.push({ rule_id: "H_COVER_ALL_SLOTS", detail: `slot_id ${slotId} not assigned` })
  }

  // H_PROVIDER_ONE_SLOT_PER_DAY: no provider in two assignments on the same date.
  for (const [date, list] of assignmentsByDate) {
    const perProvider = new Set<string>()
    for (const a of list) {
      if (perProvider.has(a.provider_id))
        violations.push({
          rule_id: "H_PROVIDER_ONE_SLOT_PER_DAY",
          detail: `provider ${a.provider_id} assigned twice on ${date}`,
        })
      perProvider.add(a.provider_id)
    }
  }

  // H_PROVIDER_ACTIVE / H_PROVIDER_AVAILABLE: assigned provider must exist, be active on the date, and
  // not be on an unavailable date.
  for (const a of assignments) {
    const provider = providerById.get(a.provider_id)
    if (provider === undefined) {
      violations.push({
        rule_id: "H_PROVIDER_ACTIVE",
        detail: `unknown provider ${a.provider_id} assigned on ${a.date}`,
      })
      continue
    }
    if (a.date < provider.active_from || (provider.active_until !== null && a.date > provider.active_until))
      violations.push({
        rule_id: "H_PROVIDER_ACTIVE",
        detail: `provider ${a.provider_id} not active on ${a.date}`,
      })
    if (!providerAvailableOn(provider, a.date) && provider.unavailable_dates.includes(a.date))
      violations.push({
        rule_id: "H_PROVIDER_AVAILABLE",
        detail: `provider ${a.provider_id} unavailable on ${a.date}`,
      })
  }

  // H_ROOM_CAPACITY: assignments per date must not exceed that day's room_count.
  for (const [date, list] of assignmentsByDate) {
    const roomCount = dayByDate.get(date)?.room_count
    if (roomCount !== undefined && list.length > roomCount)
      violations.push({
        rule_id: "H_ROOM_CAPACITY",
        detail: `${list.length} assignments exceed room_count ${roomCount} on ${date}`,
      })
  }

  // Eligibility checks: walk assignments once, classify by slot_type.
  for (const a of assignments) {
    const provider = providerById.get(a.provider_id)
    if (provider === undefined) continue
    if (isFirstEquivalentSlot(a.slot_type) && !provider.call_eligible)
      violations.push({
        rule_id: "H_CALL_ELIGIBLE_FOR_FIRST",
        detail: `non-call provider ${a.provider_id} in ${a.slot_type} on ${a.date}`,
      })
    if (isSecondOrLastSlot(a.slot_type) && !provider.call_eligible)
      violations.push({
        rule_id: "H_CALL_ELIGIBLE_FOR_SECOND_LAST",
        detail: `non-call provider ${a.provider_id} in ${a.slot_type} on ${a.date}`,
      })
    if (isEyeSlot(a.slot_type) && !provider.eye_eligible)
      violations.push({
        rule_id: "H_EYE_ELIGIBILITY",
        detail: `non-eye provider ${a.provider_id} in eye_middle on ${a.date}`,
      })
    if (isDentalSlot(a.slot_type) && !provider.dental_eligible)
      violations.push({
        rule_id: "H_DENTAL_ELIGIBILITY",
        detail: `non-dental provider ${a.provider_id} in dental_middle on ${a.date}`,
      })
  }

  // H_NON_CALL_NO_WEEKEND_OR_HOLIDAY: every assignment on a weekend or holiday day must be a
  // call-eligible provider.
  for (const a of assignments) {
    const provider = providerById.get(a.provider_id)
    if (provider === undefined || provider.call_eligible) continue
    const day = dayByDate.get(a.date)
    if (isWeekend(a.date, scenario.weekend_blocks) || (day !== undefined && day.holiday_id !== null))
      violations.push({
        rule_id: "H_NON_CALL_NO_WEEKEND_OR_HOLIDAY",
        detail: `non-call provider ${a.provider_id} on weekend/holiday ${a.date}`,
      })
  }

  // H_NO_CONSECUTIVE_CALLS / H_POST_CALL_DAY_OFF: walk adjacent horizon date pairs (prev, date) once.
  let prev: IsoDate | undefined
  for (const date of horizon) {
    if (prev !== undefined) {
      for (const provider of scenario.providers) {
        if (!hasCall.has(callKey(provider.id, prev))) continue
        if (hasCall.has(callKey(provider.id, date)))
          violations.push({
            rule_id: "H_NO_CONSECUTIVE_CALLS",
            detail: `provider ${provider.id} has call on ${prev} and ${date}`,
          })
        if ((assignmentsByDate.get(date) ?? []).some((a) => a.provider_id === provider.id))
          violations.push({
            rule_id: "H_POST_CALL_DAY_OFF",
            detail: `provider ${provider.id} assigned on ${date} after call on ${prev}`,
          })
      }
    }
    prev = date
  }

  // H_WEEKEND_BLOCK_SPLIT: each split-required block must use exactly required_distinct_call_providers
  // distinct providers holding derived call across its dates.
  for (const block of scenario.weekend_blocks) {
    if (!block.split_required) continue
    const callers = new Set<string>()
    for (const date of block.dates)
      for (const provider of scenario.providers)
        if (hasCall.has(callKey(provider.id, date))) callers.add(provider.id)
    if (callers.size !== block.required_distinct_call_providers)
      violations.push({
        rule_id: "H_WEEKEND_BLOCK_SPLIT",
        detail: `weekend block ${block.id} uses ${callers.size} distinct call providers, expected ${block.required_distinct_call_providers}`,
      })
  }

  for (const a of assignments) {
    const slot = slotById.get(a.slot_id)
    const day = dayByDate.get(a.date)
    if (slot === undefined || day === undefined) continue
    const expectedDerivedCall = day.call_required && isFirstEquivalentSlot(slot.slot_type)
    const expectedWeekend = isWeekend(a.date, scenario.weekend_blocks)
    const expectedHoliday = day.holiday_id
    if (
      a.derived_call !== expectedDerivedCall ||
      a.weekend !== expectedWeekend ||
      a.holiday_id !== expectedHoliday
    )
      violations.push({
        rule_id: "H_COVER_ALL_SLOTS",
        detail: `assignment metadata mismatch for ${a.slot_id}: derived_call/weekend/holiday_id should be ${expectedDerivedCall}/${expectedWeekend}/${expectedHoliday}`,
      })
  }

  return violations
}
