import { afterEach, describe, expect, test } from "bun:test"
import "./happydom"
import type { ScheduleResult, ScheduleStatus } from "@qgenda/core/domain/schedule"
import { emptyScorecard } from "@qgenda/core/scorecard/scorecard"
import { App } from "@qgenda/web/client/App"
import { compile, generate, getRun, listRuns } from "@qgenda/web/client/api/client"
import { PlanningProvider, usePlanning } from "@qgenda/web/client/state"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { samplePlanningJson } from "../fixtures/planning"

const originalFetch = globalThis.fetch

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
  window.location.hash = ""
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function result(status: ScheduleStatus): ScheduleResult {
  return {
    schema_version: "v0.1",
    scenario_id: "client-boundary",
    status,
    scenario_hash: "sha256:client-boundary",
    solver: {
      engine: "minizinc",
      backend: "test",
      status: status.toUpperCase(),
      objective_value: null,
      wall_time_seconds: 0,
    },
    assignments: [],
    hard_rule_report: { violation_count: 0, violations: [] },
    scorecard: emptyScorecard(),
    warnings: [],
  }
}

function createdRun(status: ScheduleStatus) {
  return { run_id: "run_client_boundary", status, result: result(status) }
}

function compileResponse() {
  return {
    status: "valid",
    scenario_hash: "sha256:client-boundary",
    horizon: { start_date: "2026-03-01", end_date: "2026-03-31", timezone: "UTC" },
    counts: { days: 31, providers: 5, holidays: 0, weekend_blocks: 0 },
    diagnostics: [],
  }
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch
}

function SaveHarness() {
  const { planning, update, save, saveState } = usePlanning()
  if (planning === null) return <p>loading</p>
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          update({ ...planning, workspace: { ...planning.workspace, timezone: "America/New_York" } })
        }
      >
        edit
      </button>
      <button
        type="button"
        onClick={() =>
          update({ ...planning, workspace: { ...planning.workspace, active_cycle_start: "2026-02-01" } })
        }
      >
        edit again
      </button>
      <button type="button" onClick={() => void save()}>
        save
      </button>
      <span data-testid="save-state">{saveState.kind}</span>
    </div>
  )
}

describe("client API boundary", () => {
  test("maps malformed compile responses to an explicit unexpected response outcome", async () => {
    mockFetch(() => jsonResponse({ status: "valid" }))

    const outcome = await compile({ start_date: "2026-03-01", end_date: "2026-03-31" })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.status).toBe("unexpected_response")
      expect(outcome.messages).toEqual(["Unexpected API response while compiling planning."])
    }
  })

  test("keeps engine-reached generate results reviewable and typed", async () => {
    mockFetch(() => jsonResponse(createdRun("solver_error"), 500))

    const outcome = await generate({
      horizon: { start_date: "2026-03-01", end_date: "2026-03-31" },
      solver: { max_seconds: 30, random_seed: 1, allow_feasible_result: false },
    })

    expect(outcome.kind).toBe("engine")
    if (outcome.kind === "engine") expect(outcome.run.status).toBe("solver_error")
  })

  test("surfaces malformed run-list and run-detail responses as unexpected_response", async () => {
    mockFetch((url) => (url.endsWith("/schedule-runs") ? jsonResponse({ runs: [] }) : jsonResponse({})))

    const list = await listRuns()
    expect(list).toEqual({
      ok: false,
      status: "unexpected_response",
      errors: ["Unexpected API response while loading runs."],
    })

    const detail = await getRun("run_missing")
    expect(detail).toEqual({
      ok: false,
      status: "unexpected_response",
      errors: ["Unexpected API response while loading run."],
    })
  })
})

describe("client route boundary", () => {
  test("shows a planning-load contract error instead of leaving screens loading", async () => {
    window.location.hash = "#/"
    mockFetch(() => jsonResponse({ workspace: {} }))

    const view = render(<App />)

    await waitFor(() => expect(view.getByText("Planning unavailable")).toBeDefined())
    expect(view.getAllByText("Unexpected API response while loading planning.").length).toBeGreaterThan(0)
  })

  test("shows compile-preview contract errors on the generate screen", async () => {
    window.location.hash = "#/generate"
    mockFetch((url) =>
      url.endsWith("/planning") ? jsonResponse(samplePlanningJson) : jsonResponse({ status: "valid" }),
    )

    const view = render(<App />)
    await waitFor(() => expect(view.getByRole("button", { name: "Compile preview" })).toBeDefined())
    fireEvent.click(view.getByRole("button", { name: "Compile preview" }))

    await waitFor(() =>
      expect(view.getByText("Unexpected API response while compiling planning.")).toBeDefined(),
    )
  })

  test("shows run-list contract errors on the runs screen", async () => {
    window.location.hash = "#/runs"
    mockFetch((url) => (url.endsWith("/planning") ? jsonResponse(samplePlanningJson) : jsonResponse({})))

    const view = render(<App />)

    await waitFor(() => expect(view.getByText("Runs unavailable")).toBeDefined())
    expect(view.getByText("Unexpected API response while loading runs.")).toBeDefined()
  })

  test("shows run-detail contract errors on the run review screen", async () => {
    window.location.hash = "#/runs/run_client_boundary"
    mockFetch((url) => (url.endsWith("/planning") ? jsonResponse(samplePlanningJson) : jsonResponse({})))

    const view = render(<App />)

    await waitFor(() => expect(view.getByText("Run unavailable")).toBeDefined())
    expect(view.getByText("Unexpected API response while loading run.")).toBeDefined()
  })

  test("shows engine-reached generation statuses with a review link", async () => {
    window.location.hash = "#/generate"
    mockFetch((url, init) => {
      if (url.endsWith("/planning")) return jsonResponse(samplePlanningJson)
      if (url.endsWith("/scenarios/compile")) return jsonResponse(compileResponse())
      if (url.endsWith("/schedule-runs") && init?.method === "POST")
        return jsonResponse(createdRun("solver_error"), 500)
      return jsonResponse([])
    })

    const view = render(<App />)
    await waitFor(() => expect(view.getByRole("button", { name: "Compile preview" })).toBeDefined())
    fireEvent.click(view.getByRole("button", { name: "Compile preview" }))
    await waitFor(() => expect(view.getByText(/Compiled: 31 days/)).toBeDefined())
    fireEvent.click(view.getByRole("button", { name: "Generate schedule" }))

    await waitFor(() => expect(view.getByText(/Solver error/)).toBeDefined())
    expect(view.getByRole("link", { name: "open run" }).getAttribute("href")).toBe(
      "#/runs/run_client_boundary",
    )
  })

  test("shows planning save failures from the structured save response", async () => {
    window.location.hash = "#/"
    mockFetch((url, init) => {
      if (url.endsWith("/planning") && init?.method === "PUT")
        return jsonResponse({ status: "invalid_planning", errors: ["bad save"], diagnostics: [] }, 400)
      if (url.endsWith("/planning")) return jsonResponse(samplePlanningJson)
      return jsonResponse([])
    })

    const view = render(<App />)
    await waitFor(() => expect(view.getByLabelText("Timezone")).toBeDefined())
    fireEvent.change(view.getByLabelText("Timezone"), { target: { value: "America/New_York" } })
    fireEvent.click(view.getByRole("button", { name: "Save planning" }))

    await waitFor(() => expect(view.getByText("bad save")).toBeDefined())
  })

  test("keeps planning dirty when edits happen while an older save is in flight", async () => {
    const deferred: { resolve?: (response: Response) => void } = {}
    mockFetch((url, init) => {
      if (url.endsWith("/planning") && init?.method === "PUT")
        return new Promise<Response>((resolve) => {
          deferred.resolve = resolve
        })
      if (url.endsWith("/planning")) return jsonResponse(samplePlanningJson)
      return jsonResponse([])
    })

    const view = render(
      <PlanningProvider>
        <SaveHarness />
      </PlanningProvider>,
    )
    await waitFor(() => expect(view.getByRole("button", { name: "edit" })).toBeDefined())
    fireEvent.click(view.getByRole("button", { name: "edit" }))
    fireEvent.click(view.getByRole("button", { name: "save" }))
    fireEvent.click(view.getByRole("button", { name: "edit again" }))

    if (deferred.resolve === undefined) throw new Error("save request was not issued")
    deferred.resolve(jsonResponse(samplePlanningJson))

    await waitFor(() => expect(view.getByTestId("save-state").textContent).toBe("dirty"))
  })
})
