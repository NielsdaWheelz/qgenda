import {
  compareIsoDate,
  eachDate,
  isSemanticIsoDate,
  isValidTimeZone,
  isWeekend,
  providerAvailableOn,
} from "../domain/calendar"
import type { ScheduleScenario, Weights } from "../domain/scenario"
import { summarizeDayEligibility } from "./dayEligibility"

// Cross-field and business preflight checks the input schema cannot express. Schema decode has
// already enforced literals, types, ranges, and non-negativity, so this only covers relationships
// between providers, days, holidays, weekend blocks, and the ledger. Each message is
// "<CODE>: <detail>"; an empty result means the scenario is feasible to attempt.
export function preflight(scenario: ScheduleScenario, _weights: Weights): string[] {
  const { horizon, providers, days, holidays, weekend_blocks, opening_ledger } = scenario
  const errors: string[] = []

  for (const date of [horizon.start_date, horizon.end_date]) {
    if (!isSemanticIsoDate(date)) errors.push(`INVALID_DATE: horizon contains invalid date ${date}`)
  }
  if (isSemanticIsoDate(horizon.start_date) && isSemanticIsoDate(horizon.end_date)) {
    if (compareIsoDate(horizon.start_date, horizon.end_date) > 0)
      errors.push(`INVALID_HORIZON: start_date ${horizon.start_date} is after end_date ${horizon.end_date}`)
  }
  if (!isValidTimeZone(horizon.timezone)) errors.push(`INVALID_TIMEZONE: ${horizon.timezone}`)

  for (const provider of providers) {
    if (!isSemanticIsoDate(provider.active_from))
      errors.push(`INVALID_DATE: provider ${provider.id} active_from ${provider.active_from}`)
    if (provider.active_until !== null && !isSemanticIsoDate(provider.active_until))
      errors.push(`INVALID_DATE: provider ${provider.id} active_until ${provider.active_until}`)
    if (
      provider.active_until !== null &&
      isSemanticIsoDate(provider.active_from) &&
      isSemanticIsoDate(provider.active_until) &&
      compareIsoDate(provider.active_from, provider.active_until) > 0
    )
      errors.push(`INVALID_ACTIVE_RANGE: provider ${provider.id} active_from is after active_until`)
    for (const date of provider.unavailable_dates)
      if (!isSemanticIsoDate(date)) errors.push(`INVALID_DATE: provider ${provider.id} unavailable ${date}`)
  }
  for (const day of days) if (!isSemanticIsoDate(day.date)) errors.push(`INVALID_DATE: day ${day.date}`)
  for (const holiday of holidays)
    if (!isSemanticIsoDate(holiday.date)) errors.push(`INVALID_DATE: holiday ${holiday.id} ${holiday.date}`)
  for (const block of weekend_blocks)
    for (const date of block.dates)
      if (!isSemanticIsoDate(date)) errors.push(`INVALID_DATE: weekend block ${block.id} ${date}`)

  if (errors.some((e) => e.startsWith("INVALID_DATE:") || e.startsWith("INVALID_HORIZON:"))) return errors

  const seenProviders = new Set<string>()
  for (const p of providers) {
    if (seenProviders.has(p.id)) errors.push(`DUPLICATE_PROVIDER_ID: ${p.id}`)
    seenProviders.add(p.id)
  }
  const horizonDates = eachDate(horizon.start_date, horizon.end_date)
  const horizonSet = new Set<string>(horizonDates)

  const seenDays = new Set<string>()
  for (const day of days) {
    if (seenDays.has(day.date)) errors.push(`DUPLICATE_DAY: ${day.date}`)
    seenDays.add(day.date)
    if (!horizonSet.has(day.date)) errors.push(`DAY_OUTSIDE_HORIZON: ${day.date}`)
  }
  for (const date of horizonDates) {
    if (!seenDays.has(date)) errors.push(`H_HORIZON_COMPLETE: missing ${date}`)
  }

  const holidayIds = new Set<string>()
  for (const h of holidays) {
    if (holidayIds.has(h.id)) errors.push(`DUPLICATE_HOLIDAY_ID: ${h.id}`)
    holidayIds.add(h.id)
    if (!horizonSet.has(h.date)) errors.push(`HOLIDAY_OUTSIDE_HORIZON: ${h.id} ${h.date}`)
  }
  const holidayById = new Map(holidays.map((h) => [h.id, h]))

  const blockIds = new Set<string>()
  const dayByDate = new Map(days.map((day) => [day.date, day]))
  for (const b of weekend_blocks) {
    if (blockIds.has(b.id)) errors.push(`DUPLICATE_WEEKEND_BLOCK_ID: ${b.id}`)
    blockIds.add(b.id)
    const blockDateSet = new Set<string>()
    for (const date of b.dates) {
      if (blockDateSet.has(date)) errors.push(`DUPLICATE_WEEKEND_BLOCK_DATE: ${b.id} ${date}`)
      blockDateSet.add(date)
      if (!horizonSet.has(date)) errors.push(`WEEKEND_BLOCK_DATE_OUTSIDE_HORIZON: ${b.id} ${date}`)
    }
    const callDates = b.dates.filter((date) => {
      const day = dayByDate.get(date)
      return day?.call_required === true && day.normal_list_slots > 0
    })
    const providersAvailableInBlock = providers.filter(
      (p) => p.call_eligible && callDates.some((date) => providerAvailableOn(p, date)),
    ).length
    const distinctCallCapacity = Math.min(callDates.length, providersAvailableInBlock)
    if (b.split_required && b.required_distinct_call_providers > distinctCallCapacity)
      errors.push(
        `H_WEEKEND_BLOCK_SPLIT: ${b.id} requires ${b.required_distinct_call_providers} distinct call providers but only ${distinctCallCapacity} can cover call dates in the block`,
      )
  }
  const blockById = new Map(weekend_blocks.map((b) => [b.id, b]))

  for (const h of holidays) {
    if (h.weekend_block_id !== null && !blockIds.has(h.weekend_block_id))
      errors.push(`UNKNOWN_WEEKEND_BLOCK_REF: holiday ${h.id} -> ${h.weekend_block_id}`)
    const block = h.weekend_block_id === null ? undefined : blockById.get(h.weekend_block_id)
    if (block !== undefined && !block.dates.includes(h.date))
      errors.push(`WEEKEND_BLOCK_DATE_MISMATCH: holiday ${h.id} date ${h.date} not in ${block.id}`)
  }

  const ledgerProviderIds = new Set<string>()
  for (const ledger of opening_ledger) {
    if (ledgerProviderIds.has(ledger.provider_id))
      errors.push(`DUPLICATE_LEDGER_PROVIDER: ${ledger.provider_id}`)
    ledgerProviderIds.add(ledger.provider_id)
  }
  for (const id of ledgerProviderIds) {
    if (!seenProviders.has(id)) errors.push(`UNKNOWN_LEDGER_PROVIDER: ${id}`)
  }

  for (const day of days) {
    if (day.holiday_id !== null) {
      const holiday = holidayById.get(day.holiday_id)
      if (holiday === undefined) errors.push(`UNKNOWN_HOLIDAY_REF: ${day.date} -> ${day.holiday_id}`)
      else if (holiday.date !== day.date)
        errors.push(`HOLIDAY_DATE_MISMATCH: ${day.date} references ${day.holiday_id} dated ${holiday.date}`)
    }
    if (day.weekend_block_id !== null) {
      const block = blockById.get(day.weekend_block_id)
      if (block === undefined)
        errors.push(`UNKNOWN_WEEKEND_BLOCK_REF: ${day.date} -> ${day.weekend_block_id}`)
      else if (!block.dates.includes(day.date))
        errors.push(`WEEKEND_BLOCK_DATE_MISMATCH: ${day.date} references ${day.weekend_block_id}`)
    }

    const totalSlots = day.normal_list_slots + day.eye_slots + day.dental_slots
    if (totalSlots > day.room_count)
      errors.push(
        `H_ROOM_CAPACITY: ${day.date} demands ${totalSlots} slots but room_count is ${day.room_count}`,
      )
    if (day.call_required && day.normal_list_slots < 1)
      errors.push(`H_CALL_REQUIRES_FIRST_SLOT: ${day.date} call_required but normal_list_slots is 0`)

    const summary = summarizeDayEligibility(day, providers, weekend_blocks)
    const callEligibleHere = summary.call_eligible_available
    const needsCall = day.call_required || isWeekend(day.date, weekend_blocks) || day.holiday_id !== null
    const callRestrictedNeed = needsCall
      ? Math.max(1, summary.call_restricted_slots)
      : summary.call_restricted_slots
    if (callRestrictedNeed > 0 && callEligibleHere < callRestrictedNeed)
      errors.push(
        `H_CALL_ELIGIBLE_FOR_FIRST: ${day.date} needs ${callRestrictedNeed} call-eligible provider(s) but only ${callEligibleHere} are active+available`,
      )

    const weekendOrHoliday = isWeekend(day.date, weekend_blocks) || day.holiday_id !== null
    if (weekendOrHoliday && callEligibleHere < totalSlots)
      errors.push(
        `H_NON_CALL_NO_WEEKEND_OR_HOLIDAY: ${day.date} needs ${totalSlots} call-eligible providers but only ${callEligibleHere} are active+available`,
      )

    if (day.eye_slots > 0 && summary.eye_eligible_available < day.eye_slots)
      errors.push(
        `H_EYE_ELIGIBILITY: ${day.date} has ${day.eye_slots} eye slot(s) but only ${summary.eye_eligible_available} eligible provider(s) active+available`,
      )
    if (day.dental_slots > 0 && summary.dental_eligible_available < day.dental_slots)
      errors.push(
        `H_DENTAL_ELIGIBILITY: ${day.date} has ${day.dental_slots} dental slot(s) but only ${summary.dental_eligible_available} eligible provider(s) active+available`,
      )
    if (!summary.can_cover_all_slots)
      errors.push(`H_PROVIDER_ONE_SLOT_PER_DAY: ${day.date} has no distinct eligible provider matching`)
  }

  return errors
}
