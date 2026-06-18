import {
  callBurdenWeight,
  isDentalSlot,
  isEyeSlot,
  isFirstEquivalentSlot,
  isLastEquivalentSlot,
  isMiddleBurdenSlot,
  isWeekend,
  providerAvailableOn,
  type Slot,
} from "../domain/calendar"
import { providerCanCoverSlot } from "../domain/eligibility"
import type { ProviderId } from "../domain/ids"
import type { DayDemand, Provider, ScheduleScenario, Weights } from "../domain/scenario"
import type { Assignment, FairnessTargets, LedgerRow, ProviderTargets } from "../domain/schedule"

// Owner of FTE-normalized fairness targets and the per-provider fairness ledger (spec "Fairness
// Ledger", "FTE-normalized fairness targets"). All weekend/holiday/weight facts come from
// domain/calendar; this module never re-derives them.

// The ten balanced ledgers and their FTE pool. call & workday plus the four call-position ledgers
// draw from call-eligible providers; middle and workday from everyone; eye/dental from skill-eligible.
type LedgerKey = keyof ProviderTargets
const POOL: Record<LedgerKey, (p: ScheduleScenario["providers"][number]) => boolean> = {
  call: (p) => p.call_eligible,
  weekend: (p) => p.call_eligible,
  holiday: (p) => p.call_eligible,
  first: (p) => p.call_eligible,
  second: (p) => p.call_eligible,
  last: (p) => p.call_eligible,
  middle: () => true,
  workday: () => true,
  eye: (p) => p.eye_eligible,
  dental: (p) => p.dental_eligible,
}

export function fairnessTargets(
  scenario: ScheduleScenario,
  slots: readonly Slot[],
  weights: Weights,
): FairnessTargets {
  const { providers, days, holidays, weekend_blocks, opening_ledger } = scenario
  const callDays = days.filter((d) => d.call_required)
  const callWeight = (d: DayDemand): number => callBurdenWeight(d, holidays, weekend_blocks, weights)

  // total_L: horizon amount to assign for each ledger.
  const total: Record<LedgerKey, number> = {
    call: callDays.reduce((sum, d) => sum + callWeight(d), 0),
    weekend: callDays
      .filter((d) => isWeekend(d.date, weekend_blocks))
      .reduce((sum, d) => sum + callWeight(d), 0),
    holiday: callDays.filter((d) => d.holiday_id !== null).reduce((sum, d) => sum + callWeight(d), 0),
    first: slots.filter((s) => isFirstEquivalentSlot(s.slot_type)).length,
    second: slots.filter((s) => s.slot_type === "normal_second").length,
    middle: slots.filter((s) => isMiddleBurdenSlot(s.slot_type)).length,
    last: slots.filter((s) => isLastEquivalentSlot(s.slot_type)).length,
    eye: countType(slots, "eye_middle"),
    dental: countType(slots, "dental_middle"),
    workday: slots.length,
  }

  // opening_L[p]: starting ledger value (workday has no opening). A provider absent from the opening
  // ledger reads as all zeros.
  const open = new Map(opening_ledger.map((l) => [l.provider_id, l]))
  const openingOf = (p: ProviderId, key: LedgerKey): number => {
    const o = open.get(p)
    if (o === undefined) return 0
    switch (key) {
      case "call":
        return o.call_burden
      case "weekend":
        return o.weekend_burden
      case "holiday":
        return o.holiday_burden
      case "first":
        return o.first_count
      case "second":
        return o.second_count
      case "middle":
        return o.middle_count
      case "last":
        return o.last_count
      case "eye":
        return o.eye_count
      case "dental":
        return o.dental_count
      case "workday":
        return 0
    }
  }

  // Per ledger: grand_L = total_L + Σ opening over the pool, and the pool's FTE denominator.
  const keys = Object.keys(POOL) as LedgerKey[]
  const grand = {} as Record<LedgerKey, number>
  const exposure = new Map<ProviderId, ProviderTargets>()
  const exposureSum = {} as Record<LedgerKey, number>
  for (const key of keys) {
    const pool = providers.filter(POOL[key])
    grand[key] = total[key] + pool.reduce((sum, q) => sum + openingOf(q.id, key), 0)
    exposureSum[key] = 0
  }
  for (const p of providers) {
    const row = {} as ProviderTargets
    for (const key of keys) {
      const value = POOL[key](p) ? exposureFor(scenario, slots, weights, p, key) : 0
      row[key] = value
      exposureSum[key] += value
    }
    exposure.set(p.id, row)
  }

  const targets: FairnessTargets = new Map()
  for (const p of providers) {
    const row = {} as ProviderTargets
    for (const key of keys) {
      // target_L[p] = grand_L * exposure_share − opening. Exposure is provider FTE multiplied by
      // the count/weight of ledger units the provider could actually work in this horizon.
      row[key] =
        POOL[key](p) && exposureSum[key] > 0
          ? grand[key] * ((exposure.get(p.id)?.[key] ?? 0) / exposureSum[key]) - openingOf(p.id, key)
          : 0
    }
    targets.set(p.id, row)
  }
  return targets
}

function countType(slots: readonly Slot[], t: Slot["slot_type"]): number {
  return slots.filter((s) => s.slot_type === t).length
}

function exposureFor(
  scenario: ScheduleScenario,
  slots: readonly Slot[],
  weights: Weights,
  provider: Provider,
  key: LedgerKey,
): number {
  const { days, holidays, weekend_blocks } = scenario
  const dayByDate = new Map(days.map((d) => [d.date, d]))
  const available = (date: string): boolean => providerAvailableOn(provider, date as DayDemand["date"])
  const weightedCallDays = (keep: (day: DayDemand) => boolean): number =>
    days
      .filter((day) => day.call_required && keep(day) && available(day.date))
      .reduce((sum, day) => sum + callBurdenWeight(day, holidays, weekend_blocks, weights), 0)
  const slotUnits = (keep: (slot: Slot, day: DayDemand) => boolean): number =>
    slots.filter((slot) => {
      const day = dayByDate.get(slot.date)
      return day !== undefined && providerCanCoverSlot(provider, slot, day, weekend_blocks) && keep(slot, day)
    }).length

  switch (key) {
    case "call":
      return provider.fte * weightedCallDays(() => true)
    case "weekend":
      return provider.fte * weightedCallDays((day) => isWeekend(day.date, weekend_blocks))
    case "holiday":
      return provider.fte * weightedCallDays((day) => day.holiday_id !== null)
    case "first":
      return provider.fte * slotUnits((slot) => isFirstEquivalentSlot(slot.slot_type))
    case "second":
      return provider.fte * slotUnits((slot) => slot.slot_type === "normal_second")
    case "middle":
      return provider.fte * slotUnits((slot) => isMiddleBurdenSlot(slot.slot_type))
    case "last":
      return provider.fte * slotUnits((slot) => isLastEquivalentSlot(slot.slot_type))
    case "eye":
      return provider.fte * slotUnits((slot) => isEyeSlot(slot.slot_type))
    case "dental":
      return provider.fte * slotUnits((slot) => isDentalSlot(slot.slot_type))
    case "workday":
      return provider.fte * slotUnits(() => true)
  }
}

export function ledgerRows(
  scenario: ScheduleScenario,
  _slots: readonly Slot[],
  weights: Weights,
  targets: FairnessTargets,
  assignments: readonly Assignment[],
): LedgerRow[] {
  const { providers, days, holidays, weekend_blocks } = scenario
  const dayOf = new Map(days.map((d) => [d.date, d]))
  const byProvider = new Map<ProviderId, Assignment[]>(providers.map((p) => [p.id, []]))
  for (const a of assignments) byProvider.get(a.provider_id)?.push(a)

  return providers.map((p) => {
    const mine = byProvider.get(p.id) ?? []
    let call_burden = 0
    let weekend_burden = 0
    let holiday_burden = 0
    let call_count = 0
    let weekend_count = 0
    let holiday_count = 0
    let first_count = 0
    let second_count = 0
    let middle_count = 0
    let last_count = 0
    let eye_count = 0
    let dental_count = 0
    for (const a of mine) {
      if (isFirstEquivalentSlot(a.slot_type)) first_count++
      if (a.slot_type === "normal_second") second_count++
      if (isMiddleBurdenSlot(a.slot_type)) middle_count++
      if (isLastEquivalentSlot(a.slot_type)) last_count++
      if (isEyeSlot(a.slot_type)) eye_count++
      if (isDentalSlot(a.slot_type)) dental_count++
      if (!isFirstEquivalentSlot(a.slot_type)) continue
      const day = dayOf.get(a.date)
      // justify-defect: every assignment date is a horizon day, and call lives on a call_required day.
      if (day === undefined) throw new Error(`assignment on non-horizon date ${a.date}`)
      if (!day.call_required) continue
      const burden = callBurdenWeight(day, holidays, weekend_blocks, weights)
      call_count++
      call_burden += burden
      if (isWeekend(day.date, weekend_blocks)) {
        weekend_count++
        weekend_burden += burden
      }
      if (day.holiday_id !== null) {
        holiday_count++
        holiday_burden += burden
      }
    }
    // justify-defect: fairnessTargets covers every roster provider.
    const target = targets.get(p.id)
    if (target === undefined) throw new Error(`missing fairness target for ${p.id}`)
    return {
      provider_id: p.id,
      fte: p.fte,
      workday_count: mine.length,
      call_count,
      call_burden,
      weekend_count,
      weekend_burden,
      holiday_count,
      holiday_burden,
      first_count,
      second_count,
      middle_count,
      last_count,
      eye_count,
      dental_count,
      target_call_burden: target.call,
      call_delta: call_burden - target.call,
      target_weekend_burden: target.weekend,
      weekend_delta: weekend_burden - target.weekend,
      target_holiday_burden: target.holiday,
      holiday_delta: holiday_burden - target.holiday,
      target_first_count: target.first,
      first_delta: first_count - target.first,
      target_second_count: target.second,
      second_delta: second_count - target.second,
      target_middle_count: target.middle,
      middle_delta: middle_count - target.middle,
      target_last_count: target.last,
      last_delta: last_count - target.last,
      target_eye_count: target.eye,
      eye_delta: eye_count - target.eye,
      target_dental_count: target.dental,
      dental_delta: dental_count - target.dental,
      target_workday_count: target.workday,
      workday_delta: mine.length - target.workday,
    }
  })
}
