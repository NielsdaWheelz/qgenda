import {
  callBurdenWeight,
  eachDate,
  isCallRestrictedSlot,
  isDentalSlot,
  isEyeSlot,
  isFirstEquivalentSlot,
  isLastEquivalentSlot,
  isMiddleBurdenSlot,
  isWeekend,
  weekendPeriods,
} from "../../domain/calendar"
import type { ProviderTargets } from "../../domain/schedule"
import type { SolveInput } from "../Solver"

// Encodes a validated SolveInput into the JSON data object schedule.mzn declares. Works purely in
// adapter-local 1-based integer indexes (PROV/DAY/SLOT/BLK); decodeSolution maps them back to IDs.

const ZERO_TARGETS: ProviderTargets = {
  call: 0,
  weekend: 0,
  holiday: 0,
  first: 0,
  second: 0,
  middle: 0,
  last: 0,
  eye: 0,
  dental: 0,
  workday: 0,
}

export function encodeScenario(input: SolveInput): Record<string, unknown> {
  const { scenario, slots, weights } = input
  const { providers, days, holidays, weekend_blocks } = scenario
  const dates = eachDate(scenario.horizon.start_date, scenario.horizon.end_date)

  const dayIndex = new Map(dates.map((date, i) => [date, i + 1]))
  const demandByDate = new Map(days.map((d) => [d.date, d]))
  const blocks = weekendPeriods(scenario.horizon, weekend_blocks)

  // first_slot_of_day[d] = slot index of that day's first-equivalent slot (or 0 if none).
  const firstSlotOfDay = dates.map((date) => {
    const s = slots.findIndex((slot) => slot.date === date && isFirstEquivalentSlot(slot.slot_type))
    return s === -1 ? 0 : s + 1
  })

  return {
    P: providers.length,
    D: dates.length,
    S: slots.length,
    B: blocks.length,

    slot_day: slots.map((s) => dayIndex.get(s.date) ?? defect(`slot date ${s.date} outside horizon`)),
    slot_req_call: slots.map((s) => isCallRestrictedSlot(s.slot_type)),
    slot_eye: slots.map((s) => isEyeSlot(s.slot_type)),
    slot_dental: slots.map((s) => isDentalSlot(s.slot_type)),
    slot_is_first: slots.map((s) => isFirstEquivalentSlot(s.slot_type)),
    slot_is_second: slots.map((s) => s.slot_type === "normal_second"),
    slot_is_middle: slots.map((s) => isMiddleBurdenSlot(s.slot_type)),
    slot_is_last: slots.map((s) => isLastEquivalentSlot(s.slot_type)),

    day_call_required: dates.map((date) => day(demandByDate, date).call_required),
    first_slot_of_day: firstSlotOfDay,
    call_weight: dates.map((date) =>
      Math.round(callBurdenWeight(day(demandByDate, date), holidays, blocks, weights) * 100),
    ),
    day_weekend: dates.map((date) => isWeekend(date, blocks)),
    day_holiday: dates.map((date) => day(demandByDate, date).holiday_id !== null),

    avail: providers.map((p) => {
      const unavailable = new Set(p.unavailable_dates)
      return dates.map(
        (date) =>
          p.active_from <= date &&
          (p.active_until === null || date <= p.active_until) &&
          !unavailable.has(date),
      )
    }),
    call_elig: providers.map((p) => p.call_eligible),
    eye_elig: providers.map((p) => p.eye_eligible),
    dental_elig: providers.map((p) => p.dental_eligible),

    block_day: blocks.map((blk) => {
      const blkDates = new Set(blk.dates)
      return dates.map((date) => blkDates.has(date))
    }),
    block_split: blocks.map((blk) => blk.split_required),
    block_required: blocks.map((blk) => blk.required_distinct_call_providers),

    target_call: targets(input, (t) => Math.round(t.call * 100)),
    target_weekend: targets(input, (t) => Math.round(t.weekend * 100)),
    target_holiday: targets(input, (t) => Math.round(t.holiday * 100)),
    target_first: targets(input, (t) => Math.round(t.first)),
    target_second: targets(input, (t) => Math.round(t.second)),
    target_middle: targets(input, (t) => Math.round(t.middle)),
    target_last: targets(input, (t) => Math.round(t.last)),
    target_eye: targets(input, (t) => Math.round(t.eye)),
    target_dental: targets(input, (t) => Math.round(t.dental)),
    target_workday: targets(input, (t) => Math.round(t.workday)),

    weight_first: objectiveWeight(weights.first_position),
    weight_second: objectiveWeight(weights.second_position),
    weight_middle: objectiveWeight(weights.middle_position),
    weight_last: objectiveWeight(weights.last_position),
    weight_eye: objectiveWeight(weights.eye_slot),
    weight_dental: objectiveWeight(weights.dental_slot),
  }
}

function targets(input: SolveInput, pick: (t: ProviderTargets) => number): number[] {
  return input.scenario.providers.map((p) => pick(input.targets.get(p.id) ?? ZERO_TARGETS))
}

function day(byDate: Map<string, SolveInput["scenario"]["days"][number]>, date: string) {
  const d = byDate.get(date)
  // justify-defect: preflight guarantees H_HORIZON_COMPLETE, so every horizon date has a demand.
  if (d === undefined) throw new Error(`no day demand for ${date} (H_HORIZON_COMPLETE)`)
  return d
}

function defect(message: string): never {
  // justify-defect: encodeScenario receives a validated SolveInput; a slot outside the horizon is corruption.
  throw new Error(message)
}

function objectiveWeight(weight: number): number {
  return Math.round(weight * 100)
}
