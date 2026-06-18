import { expect, test } from "bun:test"
import type { IsoDate, ProviderId, RunId } from "@qgenda/core/domain/ids"
import type { ScheduleScenario } from "@qgenda/core/domain/scenario"
import type { Assignment, ScheduleResult } from "@qgenda/core/domain/schedule"
import { calendarEvents } from "@qgenda/core/export/calendarEvents"
import { scheduleCsv } from "@qgenda/core/export/csv"
import { scheduleIcs } from "@qgenda/core/export/ics"
import { printableScheduleHtml } from "@qgenda/core/export/printableHtml"

// In-memory fixtures only — these pure exporters never touch the solver. Branded fields use `as`
// casts, mirroring the other core tests. Two providers (one with a comma+quote in the display name to
// exercise CSV/HTML escaping) and four assignments covering call, eye, dental, and a plain list slot.
const runId = "run_2026_03_01_120000" as RunId
const createdAt = "2026-03-01T12:00:00.000Z"

const scenario: ScheduleScenario = {
  schema_version: "v0.1",
  scenario_id: "export-fixture",
  horizon: { start_date: "2026-03-02" as IsoDate, end_date: "2026-03-04" as IsoDate, timezone: "UTC" },
  providers: [
    {
      id: "p1" as ProviderId,
      display_name: 'Smith, "Doc"',
      fte: 1,
      call_eligible: true,
      eye_eligible: true,
      dental_eligible: true,
      active_from: "2026-01-01" as IsoDate,
      active_until: null,
      unavailable_dates: [],
    },
    {
      id: "p2" as ProviderId,
      display_name: "Jones",
      fte: 1,
      call_eligible: true,
      eye_eligible: false,
      dental_eligible: false,
      active_from: "2026-01-01" as IsoDate,
      active_until: null,
      unavailable_dates: [],
    },
  ],
  days: [],
  holidays: [],
  weekend_blocks: [],
  opening_ledger: [],
  rules: {},
  weights: {},
  solver: {},
}

const a = (
  date: string,
  slot_id: string,
  slot_type: Assignment["slot_type"],
  provider_id: string,
  derived_call: boolean,
): Assignment => ({
  date: date as IsoDate,
  slot_id,
  slot_type,
  provider_id: provider_id as ProviderId,
  derived_call,
  weekend: false,
  holiday_id: null,
})

const result: ScheduleResult = {
  schema_version: "v0.1",
  scenario_id: "export-fixture",
  status: "optimal",
  scenario_hash: "hash",
  solver: {
    engine: "minizinc",
    backend: "test",
    status: "OPTIMAL_SOLUTION",
    objective_value: 0,
    wall_time_seconds: 0,
  },
  assignments: [
    a("2026-03-02", "2026-03-02:normal_first", "normal_first", "p1", true),
    a("2026-03-02", "2026-03-02:eye_middle:1", "eye_middle", "p2", false),
    a("2026-03-03", "2026-03-03:dental_middle:1", "dental_middle", "p1", false),
    a("2026-03-03", "2026-03-03:normal_first_last", "normal_first_last", "p2", false),
  ],
  hard_rule_report: { violation_count: 0, violations: [] },
  scorecard: {
    providers: [
      {
        provider_id: "p1" as ProviderId,
        fte: 1,
        workday_count: 2,
        call_count: 1,
        call_burden: 1,
        weekend_count: 0,
        weekend_burden: 0,
        holiday_count: 0,
        holiday_burden: 0,
        first_count: 1,
        second_count: 0,
        middle_count: 1,
        last_count: 0,
        eye_count: 1,
        dental_count: 1,
        target_call_burden: 0.5,
        call_delta: 0.5,
        target_weekend_burden: 0,
        weekend_delta: 0,
        target_holiday_burden: 0,
        holiday_delta: 0,
        target_first_count: 0.5,
        first_delta: 0.5,
        target_second_count: 0,
        second_delta: 0,
        target_middle_count: 1,
        middle_delta: 0,
        target_last_count: 0,
        last_delta: 0,
        target_eye_count: 1,
        eye_delta: 0,
        target_dental_count: 1,
        dental_delta: 0,
        target_workday_count: 2,
        workday_delta: 0,
      },
    ],
    aggregates: {
      call_burden: { max: 1, min: 0, spread: 1, variance: 0.25 },
      weekend_burden: { max: 0, min: 0, spread: 0, variance: 0 },
      holiday_burden: { max: 0, min: 0, spread: 0, variance: 0 },
      first_count: { max: 1, min: 0, spread: 1, variance: 0.25 },
      second_count: { max: 0, min: 0, spread: 0, variance: 0 },
      middle_count: { max: 1, min: 1, spread: 0, variance: 0 },
      last_count: { max: 1, min: 0, spread: 1, variance: 0.25 },
      eye_count: { max: 1, min: 1, spread: 0, variance: 0 },
      dental_count: { max: 1, min: 1, spread: 0, variance: 0 },
      workday_count: { max: 2, min: 2, spread: 0, variance: 0 },
    },
    largest_positive_delta: 0.5,
    largest_negative_delta: -0.5,
    excluded_pools: { call: [], eye: ["p2" as ProviderId], dental: ["p2" as ProviderId] },
    clusters: { consecutive_call_violations: 0, post_call_violations: 0, providers: [] },
    objective_contributions: {
      S_BALANCE_CALL_BURDEN: 0,
      S_BALANCE_WEEKEND_BURDEN: 0,
      S_BALANCE_HOLIDAY_BURDEN: 0,
      S_BALANCE_FIRST_COUNT: 0,
      S_BALANCE_SECOND_COUNT: 0,
      S_BALANCE_MIDDLE_COUNT: 0,
      S_BALANCE_LAST_COUNT: 0,
      S_BALANCE_EYE_COUNT: 0,
      S_BALANCE_DENTAL_COUNT: 0,
      S_BALANCE_WORKDAY_COUNT: 0,
      S_AVOID_WORK_CLUSTERS: 0,
      S_AVOID_WEEKEND_CLUSTERS: 0,
    },
  },
  warnings: [],
}

const utf8 = new TextEncoder()

function contentLines(ics: string): string[] {
  return ics.split("\r\n").filter((line) => line.length > 0)
}

function unfoldedIcs(ics: string): string {
  return ics.replaceAll("\r\n ", "")
}

function propertyLines(ics: string, property: string): string[] {
  const lines = ics.split("\r\n")
  const start = lines.findIndex((line) => line.startsWith(`${property}:`))
  if (start === -1) throw new Error(`expected ${property} in ICS output`)
  const first = lines[start]
  if (first === undefined) throw new Error(`expected ${property} in ICS output`)

  const propertyLines = [first]
  for (let i = start + 1; i < lines.length && lines[i]?.startsWith(" "); i += 1) {
    const line = lines[i]
    if (line !== undefined) propertyLines.push(line)
  }
  return propertyLines
}

test("CSV has the exact header, row order, and RFC-4180 escaping", () => {
  const lines = scheduleCsv(result, scenario).split("\r\n")
  expect(lines[0], "header columns and order are fixed by the spec").toBe(
    "date,slot_id,slot_type,provider_id,provider_name,derived_call,weekend,holiday_id",
  )
  expect(lines[1], "first assignment row, call=true, holiday empty; name with comma+quote is quoted").toBe(
    '2026-03-02,2026-03-02:normal_first,normal_first,p1,"Smith, ""Doc""",true,false,',
  )
  expect(lines.length, "header + 4 rows + a trailing-CRLF empty element").toBe(6)
  expect(lines[5], "the trailing CRLF leaves a final empty element").toBe("")
  expect(scheduleCsv(result, scenario).endsWith("\r\n"), "must end with a trailing CRLF").toBe(true)
})

test("ICS is byte-identical across calls and carries VCALENDAR/VEVENT, run-id UID, and a deterministic DTSTAMP", () => {
  const ics = scheduleIcs({ result, scenario, runId, createdAt })
  expect(scheduleIcs({ result, scenario, runId, createdAt }), "same snapshot must be byte-identical").toBe(
    ics,
  )
  expect(ics.includes("BEGIN:VCALENDAR"), "valid calendar wrapper").toBe(true)
  expect(ics.includes("VERSION:2.0"), "version property").toBe(true)
  expect(ics.split("BEGIN:VEVENT").length - 1, "one VEVENT per assignment").toBe(4)
  expect(ics.includes(`UID:${runId}:2026-03-02:normal_first`), "UID carries run id and slot identity").toBe(
    true,
  )
  expect(ics.includes("DTSTAMP:20260301T120000Z"), "DTSTAMP derived from createdAt, not the wall clock").toBe(
    true,
  )
  expect(ics.includes("DTSTART;VALUE=DATE:20260302"), "all-day DTSTART").toBe(true)
  expect(ics.includes("DTEND;VALUE=DATE:20260303"), "all-day DTEND is the next day").toBe(true)
})

test("ICS folds long SUMMARY, DESCRIPTION, and URL content lines to 75 octets", () => {
  const longProviderName = `Dr. Alpha, Beta; Gamma \\ Delta\nOmega ${"x".repeat(96)}`
  const longRunId = `run_${"20260301".repeat(8)}` as RunId
  const longSlotId = `2026-03-02:${"normal_first_long_".repeat(8)}`
  const longScenario: ScheduleScenario = {
    ...scenario,
    providers: scenario.providers.map((p) => (p.id === "p1" ? { ...p, display_name: longProviderName } : p)),
  }
  const longResult: ScheduleResult = {
    ...result,
    assignments: [a("2026-03-02", longSlotId, "normal_first", "p1", true)],
  }

  const ics = scheduleIcs({ result: longResult, scenario: longScenario, runId: longRunId, createdAt })
  for (const line of contentLines(ics)) {
    expect(
      utf8.encode(line).byteLength,
      `line exceeds RFC 5545's 75-octet fold limit: ${line}`,
    ).toBeLessThanOrEqual(75)
  }
  expect(propertyLines(ics, "SUMMARY").length, "long provider name forces SUMMARY folding").toBeGreaterThan(1)
  expect(
    propertyLines(ics, "DESCRIPTION").length,
    "long provider name forces DESCRIPTION folding",
  ).toBeGreaterThan(1)
  expect(propertyLines(ics, "URL").length, "long UID forces URL folding").toBeGreaterThan(1)

  const escapedLongProviderName = `Dr. Alpha\\, Beta\\; Gamma \\\\ Delta\\nOmega ${"x".repeat(96)}`
  const unfolded = unfoldedIcs(ics)
  expect(unfolded, "SUMMARY text is escaped before folding").toContain(
    `SUMMARY:Call: ${escapedLongProviderName}`,
  )
  expect(unfolded, "DESCRIPTION text is escaped before folding").toContain(
    `DESCRIPTION:Provider: ${escapedLongProviderName}\\nSlot: normal_first\\nDate: 2026-03-02`,
  )
  expect(unfolded, "URL line unfolds without data loss").toContain(
    `URL:qgenda://schedule-runs/${encodeURIComponent(longRunId)}/assignments/${encodeURIComponent(
      `${longRunId}:${longSlotId}`,
    )}`,
  )
})

test("per-provider ICS contains only that provider's events", () => {
  const ics = scheduleIcs({ result, scenario, runId, createdAt, providerId: "p2" as ProviderId })
  expect(ics.split("BEGIN:VEVENT").length - 1, "p2 holds two assignments").toBe(2)
  expect(ics.includes("2026-03-02:eye_middle:1"), "p2's eye event is present").toBe(true)
  expect(ics.includes("2026-03-02:normal_first"), "p1's call event must be filtered out").toBe(false)
})

test("calendarEvents titles use Call/Eye/Dental/List prefixes with derived_call winning", () => {
  const titles = calendarEvents(result, scenario, runId).map((e) => e.title)
  expect(titles[0], "derived_call wins even on a first-equivalent list slot").toBe('Call: Smith, "Doc"')
  expect(titles[1], "eye slot, not on call").toBe("Eye: Jones")
  expect(titles[2], "dental slot").toBe('Dental: Smith, "Doc"')
  expect(titles[3], "plain list slot").toBe("List: Jones")
})

test("exporters reject assignment/provider snapshot mismatches instead of falling back to raw ids", () => {
  const corruptResult: ScheduleResult = {
    ...result,
    assignments: [a("2026-03-02", "2026-03-02:normal_first", "normal_first", "missing", true)],
  }
  const message = /export invariant: assignment references unknown provider missing/
  expect(() => calendarEvents(corruptResult, scenario, runId)).toThrow(message)
  expect(() => scheduleCsv(corruptResult, scenario)).toThrow(message)
  expect(() => scheduleIcs({ result: corruptResult, scenario, runId, createdAt })).toThrow(message)
  expect(() => printableScheduleHtml({ result: corruptResult, scenario, runId, createdAt })).toThrow(message)
})

test("printable HTML rejects scorecard/provider snapshot mismatches", () => {
  const scorecardProvider = result.scorecard.providers[0]
  if (scorecardProvider === undefined) throw new Error("test fixture must include a scorecard provider")
  const corruptResult: ScheduleResult = {
    ...result,
    assignments: [],
    scorecard: {
      ...result.scorecard,
      providers: [{ ...scorecardProvider, provider_id: "missing" as ProviderId }],
    },
  }
  expect(() => printableScheduleHtml({ result: corruptResult, scenario, runId, createdAt })).toThrow(
    /export invariant: scorecard references unknown provider missing/,
  )
})

test("printable HTML includes the horizon and a provider name and survives empty assignments", () => {
  const html = printableScheduleHtml({ result, scenario, runId, createdAt })
  expect(html.startsWith("<!doctype html>"), "self-contained document").toBe(true)
  expect(html.includes("2026-03-02..2026-03-04"), "title carries the horizon").toBe(true)
  expect(html.includes("Jones"), "provider legend lists display names").toBe(true)
  expect(html.includes("&quot;Doc&quot;"), "dynamic text is HTML-escaped").toBe(true)
  const empty = printableScheduleHtml({
    result: { ...result, assignments: [], scorecard: { ...result.scorecard, providers: [] } },
    scenario,
    runId,
    createdAt,
  })
  expect(empty.includes("2026-03-02..2026-03-04"), "empty schedule still renders the horizon").toBe(true)
})
