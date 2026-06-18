import { expect, test } from "bun:test"
import { Schema } from "effect"
import { ScheduleScenario } from "../src/domain/scenario"
import { DEFAULT_WEIGHTS } from "../src/rules/weights"
import { preflight } from "../src/validation/preflight"

// A minimal feasible scenario: one Wednesday with a single first-equivalent slot covered by one
// provider eligible for everything. Each test spreads BASE (or a base part) into a fresh object,
// overriding only the fields that should violate one rule, decodes through the real schema
// (rejecting excess properties so input matches production), and asserts the matching CODE fires.
const PROVIDER = {
  id: "p1",
  display_name: "Provider One",
  fte: 1,
  call_eligible: true,
  eye_eligible: true,
  dental_eligible: true,
  active_from: "2026-01-01",
  active_until: null as string | null,
  unavailable_dates: [] as string[],
}
const DAY = {
  date: "2026-06-17",
  room_count: 2,
  normal_list_slots: 1,
  eye_slots: 0,
  dental_slots: 0,
  call_required: false,
  holiday_id: null as string | null,
  weekend_block_id: null as string | null,
}
const BASE = {
  schema_version: "v0.1",
  scenario_id: "base",
  horizon: { start_date: "2026-06-17", end_date: "2026-06-17", timezone: "UTC" },
  providers: [PROVIDER],
  days: [DAY],
  holidays: [] as Array<{
    id: string
    date: string
    label: string
    class: string
    weekend_block_id: string | null
  }>,
  weekend_blocks: [] as Array<{
    id: string
    dates: string[]
    split_required: boolean
    required_distinct_call_providers: number
  }>,
  opening_ledger: [] as Array<Record<string, unknown>>,
}

// decode validates through the real schema; preflight runs on the decoded value. raw is `unknown`
// because tests assemble plain JSON literals that the schema brands and defaults on the way in.
const result = (raw: unknown): string[] =>
  preflight(Schema.decodeUnknownSync(ScheduleScenario)(raw, { onExcessProperty: "error" }), DEFAULT_WEIGHTS)
const hasCode = (errs: string[], code: string): boolean => errs.some((e) => e.startsWith(`${code}:`))

// A run of consecutive non-weekend-aware days; lets weekend/block tests extend the horizon without
// re-spelling every covering day.
const daysFrom = (...dates: string[]) => dates.map((date) => ({ ...DAY, date }))

test("valid minimal scenario returns no errors", () => {
  expect(result(BASE)).toEqual([])
})

test("DUPLICATE_PROVIDER_ID fires when a provider id repeats", () => {
  const errs = result({ ...BASE, providers: [PROVIDER, { ...PROVIDER }] })
  expect(hasCode(errs, "DUPLICATE_PROVIDER_ID")).toBe(true)
})

test("H_HORIZON_COMPLETE fires for a date with no day entry", () => {
  // Horizon spans two days but only the first is covered.
  const errs = result({ ...BASE, horizon: { ...BASE.horizon, end_date: "2026-06-18" } })
  expect(hasCode(errs, "H_HORIZON_COMPLETE")).toBe(true)
  expect(errs.some((e) => e.includes("2026-06-18"))).toBe(true)
})

test("DUPLICATE_DAY fires when a date appears twice", () => {
  const errs = result({ ...BASE, days: [DAY, { ...DAY }] })
  expect(hasCode(errs, "DUPLICATE_DAY")).toBe(true)
})

test("DAY_OUTSIDE_HORIZON fires for a day dated outside the horizon", () => {
  const errs = result({ ...BASE, days: [{ ...DAY, date: "2026-07-01" }] })
  expect(hasCode(errs, "DAY_OUTSIDE_HORIZON")).toBe(true)
})

test("HOLIDAY_OUTSIDE_HORIZON fires for a holiday dated outside the horizon", () => {
  const errs = result({
    ...BASE,
    holidays: [{ id: "h1", date: "2026-12-25", label: "Xmas", class: "major", weekend_block_id: null }],
  })
  expect(hasCode(errs, "HOLIDAY_OUTSIDE_HORIZON")).toBe(true)
})

test("WEEKEND_BLOCK_DATE_OUTSIDE_HORIZON fires for a block date outside the horizon", () => {
  const errs = result({
    ...BASE,
    weekend_blocks: [
      { id: "wb1", dates: ["2026-12-25"], split_required: false, required_distinct_call_providers: 1 },
    ],
  })
  expect(hasCode(errs, "WEEKEND_BLOCK_DATE_OUTSIDE_HORIZON")).toBe(true)
})

test("UNKNOWN_HOLIDAY_REF fires when a day references a missing holiday", () => {
  const errs = result({ ...BASE, days: [{ ...DAY, holiday_id: "nope" }] })
  expect(hasCode(errs, "UNKNOWN_HOLIDAY_REF")).toBe(true)
})

test("UNKNOWN_WEEKEND_BLOCK_REF fires when a day references a missing weekend block", () => {
  const errs = result({ ...BASE, days: [{ ...DAY, weekend_block_id: "nope" }] })
  expect(hasCode(errs, "UNKNOWN_WEEKEND_BLOCK_REF")).toBe(true)
})

test("UNKNOWN_WEEKEND_BLOCK_REF fires when a holiday references a missing weekend block", () => {
  const errs = result({
    ...BASE,
    days: [{ ...DAY, holiday_id: "h1" }],
    holidays: [{ id: "h1", date: "2026-06-17", label: "Day", class: "minor", weekend_block_id: "nope" }],
  })
  expect(hasCode(errs, "UNKNOWN_WEEKEND_BLOCK_REF")).toBe(true)
})

test("H_ROOM_CAPACITY fires when total slots exceed room_count", () => {
  // 1 normal + 1 eye = 2 demanded slots against a single room.
  const errs = result({ ...BASE, days: [{ ...DAY, room_count: 1, eye_slots: 1 }] })
  expect(hasCode(errs, "H_ROOM_CAPACITY")).toBe(true)
})

test("H_CALL_REQUIRES_FIRST_SLOT fires when call_required but no normal slot exists", () => {
  const errs = result({ ...BASE, days: [{ ...DAY, call_required: true, normal_list_slots: 0 }] })
  expect(hasCode(errs, "H_CALL_REQUIRES_FIRST_SLOT")).toBe(true)
})

test("H_CALL_ELIGIBLE_FOR_FIRST fires when a call-required day has no available call-eligible provider", () => {
  const errs = result({
    ...BASE,
    providers: [{ ...PROVIDER, call_eligible: false }],
    days: [{ ...DAY, call_required: true }],
  })
  expect(hasCode(errs, "H_CALL_ELIGIBLE_FOR_FIRST")).toBe(true)
})

test("H_NON_CALL_NO_WEEKEND_OR_HOLIDAY fires when a weekend day lacks enough call-eligible providers", () => {
  // Saturday demands two slots but only one call-eligible provider is available.
  const errs = result({
    ...BASE,
    horizon: { ...BASE.horizon, end_date: "2026-06-20" },
    days: [
      ...daysFrom("2026-06-17", "2026-06-18", "2026-06-19"),
      { ...DAY, date: "2026-06-20", normal_list_slots: 2 },
    ],
  })
  expect(hasCode(errs, "H_NON_CALL_NO_WEEKEND_OR_HOLIDAY")).toBe(true)
})

test("H_EYE_ELIGIBILITY fires when an eye slot has no available eye-eligible provider", () => {
  const errs = result({
    ...BASE,
    providers: [{ ...PROVIDER, eye_eligible: false }],
    days: [{ ...DAY, eye_slots: 1 }],
  })
  expect(hasCode(errs, "H_EYE_ELIGIBILITY")).toBe(true)
})

test("H_DENTAL_ELIGIBILITY fires when a dental slot has no available dental-eligible provider", () => {
  const errs = result({
    ...BASE,
    providers: [{ ...PROVIDER, dental_eligible: false }],
    days: [{ ...DAY, dental_slots: 1 }],
  })
  expect(hasCode(errs, "H_DENTAL_ELIGIBILITY")).toBe(true)
})

test("H_WEEKEND_BLOCK_SPLIT fires when required distinct call providers exceed the roster", () => {
  const errs = result({
    ...BASE,
    horizon: { ...BASE.horizon, end_date: "2026-06-20" },
    days: daysFrom("2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20"),
    weekend_blocks: [
      { id: "wb1", dates: ["2026-06-20"], split_required: true, required_distinct_call_providers: 2 },
    ],
  })
  expect(hasCode(errs, "H_WEEKEND_BLOCK_SPLIT")).toBe(true)
})

test("UNKNOWN_LEDGER_PROVIDER fires when the ledger references a non-roster provider", () => {
  const errs = result({
    ...BASE,
    opening_ledger: [
      {
        provider_id: "ghost",
        call_burden: 0,
        weekend_burden: 0,
        holiday_burden: 0,
        first_count: 0,
        second_count: 0,
        middle_count: 0,
        last_count: 0,
        eye_count: 0,
        dental_count: 0,
      },
    ],
  })
  expect(hasCode(errs, "UNKNOWN_LEDGER_PROVIDER")).toBe(true)
})

test("rules accepts only the documented empty object", () => {
  expect(result({ ...BASE, rules: {} })).toEqual([])
  expect(() => result({ ...BASE, rules: { hidden_policy: true } })).toThrow()
})

test("INVALID_DATE fires for semantically invalid ISO dates", () => {
  const errs = result({
    ...BASE,
    horizon: { ...BASE.horizon, start_date: "2026-02-31", end_date: "2026-02-31" },
    days: [{ ...DAY, date: "2026-02-31" }],
  })
  expect(hasCode(errs, "INVALID_DATE")).toBe(true)
})

test("INVALID_TIMEZONE fires for an unknown timezone", () => {
  const errs = result({ ...BASE, horizon: { ...BASE.horizon, timezone: "Not/AZone" } })
  expect(hasCode(errs, "INVALID_TIMEZONE")).toBe(true)
})

test("duplicate holiday, weekend block, and ledger ids are rejected", () => {
  const ledger = {
    provider_id: "p1",
    call_burden: 0,
    weekend_burden: 0,
    holiday_burden: 0,
    first_count: 0,
    second_count: 0,
    middle_count: 0,
    last_count: 0,
    eye_count: 0,
    dental_count: 0,
  }
  const errs = result({
    ...BASE,
    holidays: [
      { id: "h1", date: "2026-06-17", label: "Day", class: "minor", weekend_block_id: null },
      { id: "h1", date: "2026-06-17", label: "Day Again", class: "minor", weekend_block_id: null },
    ],
    weekend_blocks: [
      { id: "wb", dates: ["2026-06-17"], split_required: false, required_distinct_call_providers: 1 },
      { id: "wb", dates: ["2026-06-17"], split_required: false, required_distinct_call_providers: 1 },
    ],
    opening_ledger: [ledger, ledger],
  })
  expect(hasCode(errs, "DUPLICATE_HOLIDAY_ID")).toBe(true)
  expect(hasCode(errs, "DUPLICATE_WEEKEND_BLOCK_ID")).toBe(true)
  expect(hasCode(errs, "DUPLICATE_LEDGER_PROVIDER")).toBe(true)
})

test("holiday and weekend block cross-reference dates must match", () => {
  const errs = result({
    ...BASE,
    horizon: { ...BASE.horizon, end_date: "2026-06-18" },
    days: [
      { ...DAY, date: "2026-06-17", holiday_id: "h1", weekend_block_id: "wb" },
      { ...DAY, date: "2026-06-18" },
    ],
    holidays: [{ id: "h1", date: "2026-06-18", label: "Other Day", class: "minor", weekend_block_id: null }],
    weekend_blocks: [
      { id: "wb", dates: ["2026-06-18"], split_required: false, required_distinct_call_providers: 1 },
    ],
  })
  expect(hasCode(errs, "HOLIDAY_DATE_MISMATCH")).toBe(true)
  expect(hasCode(errs, "WEEKEND_BLOCK_DATE_MISMATCH")).toBe(true)
})

test("H_WEEKEND_BLOCK_SPLIT uses providers active or available within the block", () => {
  const errs = result({
    ...BASE,
    horizon: { ...BASE.horizon, end_date: "2026-06-20" },
    providers: [
      { ...PROVIDER, id: "p1", unavailable_dates: ["2026-06-20"] },
      { ...PROVIDER, id: "p2", active_until: "2026-06-19" },
    ],
    days: daysFrom("2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20"),
    weekend_blocks: [
      { id: "wb", dates: ["2026-06-20"], split_required: true, required_distinct_call_providers: 2 },
    ],
  })
  expect(hasCode(errs, "H_WEEKEND_BLOCK_SPLIT")).toBe(true)
})

test("unavailable_dates makes an otherwise-eligible provider unavailable", () => {
  const errs = result({
    ...BASE,
    providers: [{ ...PROVIDER, unavailable_dates: ["2026-06-17"] }],
    days: [{ ...DAY, eye_slots: 1 }],
  })
  expect(hasCode(errs, "H_EYE_ELIGIBILITY")).toBe(true)
})
