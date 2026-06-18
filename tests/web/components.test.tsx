import { afterEach, describe, expect, test } from "bun:test"
import "./happydom"
import type { Assignment, ScheduleResult, Scorecard } from "@qgenda/core/domain/schedule"
import { emptyScorecard } from "@qgenda/core/scorecard/scorecard"
import type { EditableProvider } from "@qgenda/web/client/api/schemas"
import { CalendarGrid } from "@qgenda/web/client/components/CalendarGrid"
import { ExportMenu } from "@qgenda/web/client/components/ExportMenu"
import { ProviderDayGrid } from "@qgenda/web/client/components/ProviderDayGrid"
import { ProviderForm } from "@qgenda/web/client/components/ProviderForm"
import { ScorecardPanel } from "@qgenda/web/client/components/ScorecardPanel"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { useState } from "react"

afterEach(cleanup)

const providers = [
  { id: "dr_a", display_name: "Dr. Alpha" },
  { id: "dr_sub", display_name: "Dr. Sub" },
]

const assignment = (
  date: string,
  slot_type: Assignment["slot_type"],
  provider_id: string,
  flags: { call?: boolean; weekend?: boolean; holiday?: string },
): Assignment => ({
  date: date as Assignment["date"],
  slot_id: `${date}:${slot_type}`,
  slot_type,
  provider_id: provider_id as Assignment["provider_id"],
  derived_call: flags.call ?? false,
  weekend: flags.weekend ?? false,
  holiday_id: (flags.holiday ?? null) as Assignment["holiday_id"],
})

const result: ScheduleResult = {
  schema_version: "v0.1",
  scenario_id: "t",
  status: "optimal",
  scenario_hash: "sha256:test",
  solver: {
    engine: "minizinc",
    backend: "ortools",
    status: "OPTIMAL_SOLUTION",
    objective_value: 0,
    wall_time_seconds: 0,
  },
  assignments: [
    assignment("2026-03-06", "normal_first_last", "dr_a", { call: true, holiday: "spring" }),
    assignment("2026-03-06", "eye_middle", "dr_sub", { holiday: "spring" }),
    assignment("2026-03-07", "normal_first_last", "dr_a", { call: true, weekend: true }),
  ],
  hard_rule_report: { violation_count: 0, violations: [] },
  scorecard: emptyScorecard(),
  warnings: [],
}

describe("CalendarGrid", () => {
  test("renders assignments with provider names, call/eye tags, and weekend/holiday highlights", () => {
    const { container } = render(
      <CalendarGrid
        result={result}
        providers={providers}
        horizon={{ start_date: "2026-03-06", end_date: "2026-03-08" }}
      />,
    )
    expect(container.textContent, "call provider name rendered").toContain("Dr. Alpha")
    expect(container.textContent, "eye provider name rendered").toContain("Dr. Sub")
    expect(container.querySelector(".tag.call"), "call tag present").not.toBeNull()
    expect(container.querySelector(".tag.eye"), "eye tag present").not.toBeNull()
    expect(container.querySelector(".cell.holiday"), "holiday day highlighted").not.toBeNull()
    expect(container.querySelector(".cell.weekend"), "weekend day highlighted").not.toBeNull()
  })

  test("highlights holiday and weekend day facts even when no assignments exist", () => {
    const { container } = render(
      <CalendarGrid
        result={{ ...result, assignments: [] }}
        providers={providers}
        horizon={{ start_date: "2026-03-06", end_date: "2026-03-07" }}
        days={[
          { date: "2026-03-06" as Assignment["date"], holiday_id: "spring", weekend: false },
          { date: "2026-03-07" as Assignment["date"], holiday_id: null, weekend: true },
        ]}
      />,
    )
    expect(container.querySelector(".cell.holiday"), "empty holiday day highlighted").not.toBeNull()
    expect(container.querySelector(".cell.weekend"), "empty weekend day highlighted").not.toBeNull()
    expect(container.textContent, "non-color holiday text present").toContain("holiday")
    expect(container.textContent, "non-color weekend text present").toContain("weekend")
  })
})

describe("ProviderDayGrid", () => {
  test("renders provider rows with assignment chips by date", () => {
    const { container } = render(
      <ProviderDayGrid
        result={result}
        providers={providers}
        horizon={{ start_date: "2026-03-06", end_date: "2026-03-07" }}
      />,
    )
    expect(container.textContent, "provider matrix heading").toContain("Provider by day")
    expect(container.textContent, "provider row rendered").toContain("Dr. Alpha")
    expect(container.textContent, "call assignment chip rendered").toContain("call")
    expect(container.textContent, "eye slot chip rendered").toContain("eye_middle")
  })
})

describe("ExportMenu", () => {
  test("surfaces structured export errors inside the review UI", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: "export_error", errors: ["snapshot corrupt"] }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch
    try {
      const view = render(<ExportMenu runId="run_1" providers={providers} />)
      fireEvent.click(view.getByText("CSV"))
      await waitFor(() => expect(view.getByText("snapshot corrupt")).toBeDefined())
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe("ScorecardPanel", () => {
  const ledgerRow = {
    provider_id: "dr_a" as Assignment["provider_id"],
    fte: 1,
    workday_count: 5,
    call_count: 3,
    call_burden: 3.5,
    weekend_count: 1,
    weekend_burden: 1.5,
    holiday_count: 0,
    holiday_burden: 0,
    first_count: 3,
    second_count: 1,
    middle_count: 1,
    last_count: 0,
    eye_count: 0,
    dental_count: 0,
    target_call_burden: 3,
    call_delta: 0.5,
    target_weekend_burden: 1,
    weekend_delta: 0.5,
    target_holiday_burden: 0,
    holiday_delta: 0,
    target_first_count: 2,
    first_delta: 1,
    target_second_count: 1,
    second_delta: 0,
    target_middle_count: 2,
    middle_delta: -1,
    target_last_count: 1,
    last_delta: -1,
    target_eye_count: 0,
    eye_delta: 0,
    target_dental_count: 0,
    dental_delta: 0,
    target_workday_count: 4,
    workday_delta: 1,
  }
  const scorecard: Scorecard = {
    ...emptyScorecard(),
    providers: [ledgerRow],
    aggregates: {
      ...emptyScorecard().aggregates,
      call_burden: { max: 3.5, min: 1.25, spread: 2.25, variance: 1.265625 },
      workday_count: { max: 5, min: 2, spread: 3, variance: 2.25 },
    },
    largest_positive_delta: 0.5,
    largest_negative_delta: -1.25,
    excluded_pools: { call: ["dr_sub" as Assignment["provider_id"]], eye: [], dental: [] },
    clusters: {
      consecutive_call_violations: 0,
      post_call_violations: 0,
      providers: [
        {
          provider_id: "dr_a" as Assignment["provider_id"],
          max_consecutive_workdays: 3,
          workday_run_distribution: [2, 1],
          weekend_blocks_assigned: 1,
          consecutive_weekend_blocks: 0,
          call_spacing_min: 4,
          call_spacing_avg: 4.5,
        },
      ],
    },
    objective_contributions: {
      ...emptyScorecard().objective_contributions,
      S_BALANCE_CALL_BURDEN: 22500,
      S_AVOID_WORK_CLUSTERS: 1000,
    },
  }

  test("renders the fairness ledger and a clean hard-rule status", () => {
    const view = render(
      <ScorecardPanel
        scorecard={scorecard}
        providers={providers}
        hardRuleReport={{ violation_count: 0, violations: [] }}
        openingLedger={[
          {
            provider_id: "dr_a" as Assignment["provider_id"],
            call_burden: 1.25,
            weekend_burden: 1.25,
            holiday_burden: 0,
            first_count: 1,
            second_count: 0,
            middle_count: 2,
            last_count: 0,
            eye_count: 0,
            dental_count: 1,
          },
        ]}
        openingLedgerStartFresh={false}
      />,
    )
    expect(view.getAllByText("Dr. Alpha").length, "ledger row provider name").toBeGreaterThan(0)
    expect(view.getAllByText(/3\.50/).length, "call_burden formatted to two decimals").toBeGreaterThan(0)
    expect(view.getByText("Opening fairness debt"), "opening debt section visible").toBeDefined()
    expect(view.getByText("Fairness targets and deltas"), "target/delta section visible").toBeDefined()
    expect(view.getAllByText("Weekend burden").length, "non-call target ledger label shown").toBeGreaterThan(
      0,
    )
    expect(view.getByText("Fairness spread"), "spread section visible").toBeDefined()
    expect(view.getAllByText("2.25").length, "aggregate spread shown").toBeGreaterThan(0)
    expect(view.getByText("1.27"), "aggregate variance shown").toBeDefined()
    expect(view.getByText("Excluded pools"), "excluded pools section visible").toBeDefined()
    expect(view.getByText("Dr. Sub"), "excluded call pool provider rendered").toBeDefined()
    expect(view.getByText("S_BALANCE_CALL_BURDEN"), "objective contribution rule id shown").toBeDefined()
    expect(view.getByText("22500.00"), "objective contribution value shown").toBeDefined()
    expect(view.getByText("2, 1"), "workday run distribution shown").toBeDefined()
    expect(view.getByText("4.50"), "average call spacing shown").toBeDefined()
  })

  test("surfaces hard-rule violations", () => {
    const view = render(
      <ScorecardPanel
        scorecard={scorecard}
        providers={providers}
        hardRuleReport={{
          violation_count: 1,
          violations: [{ rule_id: "H_POST_CALL_DAY_OFF", detail: "dr_a worked after call" }],
        }}
      />,
    )
    expect(view.getByText(/H_POST_CALL_DAY_OFF/), "violation rule id shown").toBeDefined()
  })
})

describe("ProviderForm", () => {
  function Harness() {
    const [rows, setRows] = useState<EditableProvider[]>([])
    return (
      <div>
        <ProviderForm providers={rows} onChange={setRows} defaultActiveFrom="2026-01-01" />
        <span data-testid="count">{rows.length}</span>
        <span data-testid="first-id">{rows[0]?.provider_id ?? ""}</span>
      </div>
    )
  }

  test("adds valid draft provider rows and removes them through onChange", () => {
    const view = render(<Harness />)
    fireEvent.click(view.getByRole("button", { name: /add provider/i }))
    expect(view.getByTestId("count").textContent, "a row was added").toBe("1")
    expect(view.getByTestId("first-id").textContent, "a valid draft id was generated").toBe("provider_1")

    fireEvent.click(view.getByRole("button", { name: /remove/i }))
    expect(view.getByTestId("count").textContent, "the row was removed").toBe("0")
  })
})
