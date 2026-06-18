import { describe, expect, test } from "bun:test"
import type { IsoDate, ProviderId } from "@qgenda/core/domain/ids"
import { expandDemand } from "@qgenda/core/planning/demandExpansion"
import { selectOpeningLedger } from "@qgenda/core/planning/openingLedger"
import {
  DateDemandException,
  OpeningLedgerPlan,
  PlanningState,
  ProviderUnavailability,
} from "@qgenda/core/planning/planningSchema"
import { validatePlanning } from "@qgenda/core/planning/planningValidation"
import { expandUnavailableDates } from "@qgenda/core/planning/unavailableDates"
import { Schema } from "effect"
import { sampleGeneration, samplePlanning, samplePlanningJson } from "../fixtures/planning"

const horizon = sampleGeneration().horizon // 2026-03-02 (Mon) .. 2026-03-08 (Sun)
const codes = (ds: { code: string }[]) => ds.map((d) => d.code)

describe("PlanningState schema", () => {
  test("decodes the sample workspace and rejects unknown fields", () => {
    expect(samplePlanning().providers.length).toBe(5)
    expect(() =>
      Schema.decodeUnknownSync(PlanningState)(
        { ...samplePlanningJson, surprise: true },
        { onExcessProperty: "error" },
      ),
    ).toThrow()
  })
})

describe("expandDemand", () => {
  const templates = samplePlanning().demand_templates

  test("resolves each horizon date from its weekday template", () => {
    const { demandByDate, diagnostics } = expandDemand({ templates, exceptions: [], horizon })
    expect(diagnostics, JSON.stringify(diagnostics)).toEqual([])
    expect(demandByDate.size).toBe(7)
    expect(
      demandByDate.get("2026-03-04" as IsoDate)?.eye_slots,
      "Wednesday template carries an eye slot",
    ).toBe(1)
    expect(demandByDate.get("2026-03-07" as IsoDate)?.normal_list_slots, "Saturday is closed").toBe(0)
  })

  test("a full-day exception replaces the template for its date", () => {
    const exceptions = Schema.decodeUnknownSync(Schema.Array(DateDemandException))([
      {
        exception_id: "ex_dental",
        date: "2026-03-04",
        room_count: 5,
        normal_list_slots: 3,
        eye_slots: 0,
        dental_slots: 2,
        call_required: true,
        label: "Dental clinic day",
      },
    ])
    const { demandByDate } = expandDemand({ templates, exceptions, horizon })
    const wed = demandByDate.get("2026-03-04" as IsoDate)
    expect(wed?.dental_slots, "exception overrides the template's eye slot with dental slots").toBe(2)
    expect(wed?.eye_slots).toBe(0)
  })

  test("reports missing, conflicting, and over-capacity demand", () => {
    const noWednesday = templates.filter((t) => t.weekday !== "wednesday")
    expect(codes(expandDemand({ templates: noWednesday, exceptions: [], horizon }).diagnostics)).toContain(
      "C_MISSING_DEMAND_FOR_DATE",
    )

    const twoWednesdays = [...templates, ...templates.filter((t) => t.weekday === "wednesday")]
    expect(codes(expandDemand({ templates: twoWednesdays, exceptions: [], horizon }).diagnostics)).toContain(
      "C_MULTIPLE_DEMAND_TEMPLATES_FOR_DATE",
    )

    const tooManySlots = Schema.decodeUnknownSync(Schema.Array(DateDemandException))([
      {
        exception_id: "ex_over",
        date: "2026-03-03",
        room_count: 2,
        normal_list_slots: 2,
        eye_slots: 1,
        dental_slots: 0,
        call_required: true,
        label: "over capacity",
      },
    ])
    expect(codes(expandDemand({ templates, exceptions: tooManySlots, horizon }).diagnostics)).toContain(
      "C_DEMAND_EXCEEDS_ROOM_COUNT",
    )
  })
})

describe("expandUnavailableDates", () => {
  test("expands inclusive ranges clipped to the horizon", () => {
    const ranges = Schema.decodeUnknownSync(Schema.Array(ProviderUnavailability))([
      {
        unavailability_id: "v1",
        provider_id: "dr_a",
        start_date: "2026-02-28",
        end_date: "2026-03-04",
        kind: "vacation",
        label: "V",
      },
    ])
    const map = expandUnavailableDates(ranges, horizon)
    expect(map.get("dr_a" as ProviderId), "only horizon dates, sorted and inclusive").toEqual([
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ] as IsoDate[])
  })
})

describe("selectOpeningLedger", () => {
  test("selects active-cycle rows and flags unknown providers", () => {
    const zero = {
      weekend_burden: 0,
      holiday_burden: 0,
      second_count: 0,
      middle_count: 0,
      last_count: 0,
      eye_count: 0,
      dental_count: 0,
    }
    const openingLedger = Schema.decodeUnknownSync(Schema.Array(OpeningLedgerPlan))([
      {
        provider_id: "dr_a",
        cycle_start: "2026-01-01",
        as_of_date: "2026-03-01",
        call_burden: 3,
        first_count: 3,
        ...zero,
      },
      {
        provider_id: "ghost",
        cycle_start: "2026-01-01",
        as_of_date: "2026-03-01",
        call_burden: 0,
        first_count: 0,
        ...zero,
      },
      {
        provider_id: "dr_b",
        cycle_start: "2025-01-01",
        as_of_date: "2025-03-01",
        call_burden: 9,
        first_count: 9,
        ...zero,
      },
    ])
    const state = samplePlanning()
    const { rows, diagnostics } = selectOpeningLedger({
      openingLedger,
      workspace: state.workspace,
      providers: state.providers,
      horizon,
    })
    expect(
      rows.map((r) => r.provider_id),
      "only the active-cycle known provider is selected",
    ).toEqual(["dr_a"] as ProviderId[])
    expect(codes(diagnostics)).toContain("C_OPENING_LEDGER_UNKNOWN_PROVIDER")
  })

  test("requires an explicit start-fresh confirmation before missing ledger rows default to zero", () => {
    const state = samplePlanning()
    const { diagnostics } = selectOpeningLedger({
      openingLedger: [],
      workspace: { ...state.workspace, opening_ledger_start_fresh: false },
      providers: state.providers,
      horizon,
    })
    expect(codes(diagnostics)).toContain("C_OPENING_LEDGER_START_FRESH_REQUIRED")
  })

  test("rejects active-cycle rows dated after the generation horizon starts", () => {
    const state = samplePlanning()
    const openingLedger = Schema.decodeUnknownSync(Schema.Array(OpeningLedgerPlan))([
      {
        provider_id: "dr_a",
        cycle_start: "2026-01-01",
        as_of_date: "2026-03-03",
        call_burden: 1,
        weekend_burden: 0,
        holiday_burden: 0,
        first_count: 1,
        second_count: 0,
        middle_count: 0,
        last_count: 0,
        eye_count: 0,
        dental_count: 0,
      },
    ])
    const { diagnostics } = selectOpeningLedger({
      openingLedger,
      workspace: { ...state.workspace, opening_ledger_start_fresh: true },
      providers: state.providers,
      horizon,
    })
    expect(codes(diagnostics)).toContain("C_OPENING_LEDGER_AS_OF_OUTSIDE_HORIZON")
  })
})

describe("validatePlanning", () => {
  const decode = (json: unknown) => Schema.decodeUnknownSync(PlanningState)(json)

  test("flags duplicate provider ids", () => {
    const dup = decode({
      ...samplePlanningJson,
      providers: [...samplePlanningJson.providers, samplePlanningJson.providers[0]],
    })
    expect(codes(validatePlanning(dup, horizon))).toContain("C_DUPLICATE_PROVIDER_ID")
  })

  test("flags invalid workspace timezone and reversed date ranges", () => {
    const state = decode({
      ...samplePlanningJson,
      workspace: { ...samplePlanningJson.workspace, timezone: "Nope/Nowhere" },
      unavailability: [
        {
          unavailability_id: "v1",
          provider_id: "dr_a",
          start_date: "2026-03-05",
          end_date: "2026-03-04",
          kind: "leave",
          label: "x",
        },
      ],
    })
    expect(codes(validatePlanning(state, horizon))).toContain("C_INVALID_TIMEZONE")
    expect(codes(validatePlanning(state, horizon))).toContain("C_INVALID_DATE_RANGE")
  })

  test("flags semantically invalid planning dates", () => {
    const state = decode({
      ...samplePlanningJson,
      providers: [{ ...samplePlanningJson.providers[0], active_from: "2026-02-31" }],
    })
    expect(codes(validatePlanning(state, horizon))).toContain("C_INVALID_DATE")
  })

  test("flags unavailability that references an unknown provider", () => {
    const state = decode({
      ...samplePlanningJson,
      unavailability: [
        {
          unavailability_id: "v1",
          provider_id: "ghost",
          start_date: "2026-03-03",
          end_date: "2026-03-04",
          kind: "leave",
          label: "x",
        },
      ],
    })
    expect(codes(validatePlanning(state, horizon))).toContain("C_UNKNOWN_PROVIDER_REFERENCE")
  })

  test("flags a weekend block that straddles the horizon boundary", () => {
    const state = decode({
      ...samplePlanningJson,
      weekend_blocks: [
        {
          weekend_block_id: "wb",
          label: "edge",
          dates: ["2026-03-08", "2026-03-09"],
          split_required: false,
          required_distinct_call_providers: 1,
        },
      ],
    })
    expect(codes(validatePlanning(state, horizon))).toContain("C_WEEKEND_BLOCK_DATE_OUTSIDE_HORIZON")
  })

  test("flags a holiday that references an unknown weekend block", () => {
    const state = decode({
      ...samplePlanningJson,
      holidays: [
        { holiday_id: "h1", date: "2026-03-06", label: "H", class: "minor", weekend_block_id: "missing" },
      ],
    })
    expect(codes(validatePlanning(state, horizon))).toContain("C_WEEKEND_BLOCK_UNKNOWN_HOLIDAY")
  })

  test("flags holiday dates that do not belong to their weekend block", () => {
    const state = decode({
      ...samplePlanningJson,
      holidays: [
        {
          holiday_id: "h1",
          date: "2026-03-04",
          label: "Mismatch",
          class: "major",
          weekend_block_id: "wb1",
        },
      ],
      weekend_blocks: [
        {
          weekend_block_id: "wb1",
          label: "Block",
          dates: ["2026-03-06"],
          split_required: false,
          required_distinct_call_providers: 1,
        },
      ],
    })
    expect(codes(validatePlanning(state, horizon))).toContain("C_WEEKEND_BLOCK_DATE_MISMATCH")
  })
})
