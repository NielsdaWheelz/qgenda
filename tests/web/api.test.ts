import { describe, expect, test } from "bun:test"
import { compilePlanningScenario } from "@qgenda/core/compiler/compilePlanningScenario"
import { canonicalHash } from "@qgenda/core/domain/hash"
import type { ProviderId } from "@qgenda/core/domain/ids"
import type { ScheduleScenario } from "@qgenda/core/domain/scenario"
import type { ScheduleResult, ScheduleStatus } from "@qgenda/core/domain/schedule"
import { emptyScorecard } from "@qgenda/core/scorecard/scorecard"
import { openDatabase } from "@qgenda/storage/db"
import { insertScheduleRun } from "@qgenda/storage/repositories/scheduleRunRepository"
import { createApp } from "@qgenda/web/server/http"
import { sampleGenerationJson, samplePlanning, samplePlanningJson } from "../fixtures/planning"

// Full backend critical path: real Hono app over a real in-memory database and the real engine. Drives
// requests through app.request (no network), exercising decode -> compile -> solve -> persist -> export.

const app = (services: Parameters<typeof createApp>[1] = {}) => createApp(openDatabase(":memory:"), services)
const send = (a: ReturnType<typeof app>, path: string, method: string, body: unknown) =>
  a.request(`/api/v0_2${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const fakeResult = (scenario: ScheduleScenario, status: ScheduleStatus): ScheduleResult => ({
  schema_version: "v0.1",
  scenario_id: scenario.scenario_id,
  status,
  scenario_hash: canonicalHash(scenario),
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
  warnings: [`TEST_${status.toUpperCase()}`],
})

const withPlanning = async (
  planning: unknown = samplePlanningJson,
  services: Parameters<typeof app>[0] = {},
) => {
  const a = app(services)
  const put = await send(a, "/planning", "PUT", planning)
  expect(put.status, "saving the sample planning state").toBe(200)
  return a
}

describe("planning routes", () => {
  test("GET returns a bootstrap default before anything is saved", async () => {
    const res = await app().request("/api/v0_2/planning")
    expect(res.status).toBe(200)
    expect((await res.json()).workspace.workspace_id).toBe("local")
  })

  test("PUT then GET round-trips the saved planning state", async () => {
    const a = await withPlanning()
    const got = await (await a.request("/api/v0_2/planning")).json()
    expect(got.providers.length).toBe(5)
  })

  test("PUT rejects a dangling provider reference with 400", async () => {
    const res = await send(app(), "/planning", "PUT", {
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
    expect(res.status).toBe(400)
  })

  test("PUT runs planning validation before storage replacement", async () => {
    const res = await send(app(), "/planning", "PUT", {
      ...samplePlanningJson,
      providers: [...samplePlanningJson.providers, samplePlanningJson.providers[0]],
    })
    expect(res.status).toBe(400)
    expect((await res.json()).diagnostics.map((d: { code: string }) => d.code)).toContain(
      "C_DUPLICATE_PROVIDER_ID",
    )
  })

  test("PUT enforces the one local workspace contract", async () => {
    const res = await send(app(), "/planning", "PUT", {
      ...samplePlanningJson,
      workspace: { ...samplePlanningJson.workspace, workspace_id: "other" },
    })
    expect(res.status).toBe(400)
  })
})

describe("compile route", () => {
  test("returns invalid_planning before any planning state is saved", async () => {
    const res = await send(app(), "/scenarios/compile", "POST", sampleGenerationJson)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      status: "invalid_planning",
      errors: ["No planning state saved yet."],
    })
  })

  test("generation request decode failures use the invalid_planning family", async () => {
    const a = await withPlanning()
    const malformed = await a.request("/api/v0_2/scenarios/compile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    })
    expect(malformed.status).toBe(400)
    expect((await malformed.json()).status).toBe("invalid_planning")

    const missingHorizon = await send(a, "/scenarios/compile", "POST", {})
    expect(missingHorizon.status).toBe(400)
    expect((await missingHorizon.json()).status).toBe("invalid_planning")
  })

  test("returns a summary for a valid planning month", async () => {
    const a = await withPlanning()
    const res = await send(a, "/scenarios/compile", "POST", sampleGenerationJson)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("valid")
    expect(body.counts.days, "seven horizon days").toBe(7)
    expect(body.scenario_hash).toMatch(/^sha256:/)
  })

  test("returns 400 with diagnostics when a horizon date has no demand", async () => {
    const a = await withPlanning({
      ...samplePlanningJson,
      demand_templates: samplePlanningJson.demand_templates.filter((t) => t.weekday !== "wednesday"),
    })
    const res = await send(a, "/scenarios/compile", "POST", sampleGenerationJson)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.status, "planning compilation failures use the planning error family").toBe(
      "invalid_planning",
    )
    expect(body.diagnostics.map((d: { code: string }) => d.code)).toContain("C_MISSING_DEMAND_FOR_DATE")
  })
})

describe("schedule-run routes", () => {
  test("returns invalid_planning before any planning state is saved and creates no run", async () => {
    const a = app()
    const res = await send(a, "/schedule-runs", "POST", sampleGenerationJson)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      status: "invalid_planning",
      errors: ["No planning state saved yet."],
    })
    expect((await (await a.request("/api/v0_2/schedule-runs")).json()).length).toBe(0)
  })

  test("malformed generation requests are invalid_planning and create no run", async () => {
    const a = await withPlanning()
    const malformed = await a.request("/api/v0_2/schedule-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    })
    expect(malformed.status).toBe(400)
    expect((await malformed.json()).status).toBe("invalid_planning")

    const missingHorizon = await send(a, "/schedule-runs", "POST", {})
    expect(missingHorizon.status).toBe(400)
    expect((await missingHorizon.json()).status).toBe("invalid_planning")
    expect((await (await a.request("/api/v0_2/schedule-runs")).json()).length).toBe(0)
  })

  test("generates, persists, lists, and returns an optimal run", async () => {
    const a = await withPlanning()
    const res = await send(a, "/schedule-runs", "POST", sampleGenerationJson)
    expect(res.status, "optimal generation is 201").toBe(201)
    const created = await res.json()
    expect(created.status).toBe("optimal")
    expect(created.run_id).toMatch(/^run_/)

    const list = await (await a.request("/api/v0_2/schedule-runs")).json()
    expect(list.map((r: { run_id: string }) => r.run_id)).toContain(created.run_id)

    const detail = await (await a.request(`/api/v0_2/schedule-runs/${created.run_id}`)).json()
    expect(detail.result.status).toBe("optimal")
    expect(detail.result.assignments.length).toBe(7)
    expect(detail.providers.length, "provider display names for the review grid").toBe(5)
    expect(detail.days.length, "compiled day facts for calendar highlighting").toBe(7)
    expect(detail.opening_ledger_start_fresh, "opening ledger start-fresh flag returned").toBe(true)
    expect(detail.opening_ledger, "selected opening ledger rows returned from the snapshot").toEqual([])
    expect(
      detail.days.every((day: { date: string; weekend: boolean }) => typeof day.weekend === "boolean"),
    ).toBe(true)
  })

  test("malformed run ids are 400 while well-formed missing runs are 404", async () => {
    const a = await withPlanning()
    expect((await a.request("/api/v0_2/schedule-runs/%20")).status).toBe(400)
    const missing = await a.request("/api/v0_2/schedule-runs/run_missing")
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ status: "not_found", errors: ["run not found"] })
    expect((await a.request("/api/v0_2/schedule-runs/run_missing/replay", { method: "POST" })).status).toBe(
      404,
    )
  })

  test("invalid compile returns 400 and creates no run", async () => {
    const a = await withPlanning({
      ...samplePlanningJson,
      demand_templates: samplePlanningJson.demand_templates.filter((t) => t.weekday !== "monday"),
    })
    const res = await send(a, "/schedule-runs", "POST", sampleGenerationJson)
    expect(res.status).toBe(400)
    expect((await res.clone().json()).status, "invalid compile creates no run and is invalid_planning").toBe(
      "invalid_planning",
    )
    expect((await (await a.request("/api/v0_2/schedule-runs")).json()).length, "no run persisted").toBe(0)
  })

  test("an infeasible schedule returns 409 and still persists the run", async () => {
    const everyDayCall = samplePlanningJson.demand_templates.map((t) => ({
      ...t,
      room_count: 2,
      normal_list_slots: 1,
      eye_slots: 0,
      dental_slots: 0,
      call_required: true,
    }))
    const a = await withPlanning({
      ...samplePlanningJson,
      providers: [samplePlanningJson.providers[0]], // one call-eligible provider cannot cover consecutive call days
      demand_templates: everyDayCall,
    })
    const res = await send(a, "/schedule-runs", "POST", {
      horizon: { start_date: "2026-03-02", end_date: "2026-03-03" },
    })
    expect(res.status, "infeasible generation is 409").toBe(409)
    expect((await res.json()).run_id, "a run is still created once the engine was reached").toMatch(/^run_/)
    expect((await (await a.request("/api/v0_2/schedule-runs")).json()).length).toBe(1)
  })

  test("replays the stored compiled scenario snapshot instead of current planning tables", async () => {
    const a = await withPlanning()
    const created = await (await send(a, "/schedule-runs", "POST", sampleGenerationJson)).json()
    expect(created.status).toBe("optimal")

    const edited = {
      ...samplePlanningJson,
      providers: samplePlanningJson.providers.map((p) =>
        p.provider_id === "dr_a" ? { ...p, display_name: "dr_a_edited" } : p,
      ),
    }
    expect((await send(a, "/planning", "PUT", edited)).status, "live planning edit after source run").toBe(
      200,
    )

    const replayRes = await a.request(`/api/v0_2/schedule-runs/${created.run_id}/replay`, { method: "POST" })
    expect(replayRes.status).toBe(201)
    const replayed = await replayRes.json()
    expect(replayed.run_id).not.toBe(created.run_id)
    expect(replayed.status).toBe("optimal")
    expect(replayed.result.scenario_hash).toBe(created.result.scenario_hash)
    expect(
      replayed.result.assignments,
      "same compiled snapshot and solver seed produce same assignments",
    ).toEqual(created.result.assignments)
    expect((await (await a.request("/api/v0_2/schedule-runs")).json()).length).toBe(2)
  })

  for (const [status, code] of [
    ["feasible", 201],
    ["invalid_input", 400],
    ["solver_error", 500],
  ] as const) {
    test(`engine-reached ${status} result returns the mapped status and persists the run`, async () => {
      const a = await withPlanning(samplePlanningJson, {
        generateSchedule: async (scenario) => fakeResult(scenario, status),
      })
      const res = await send(a, "/schedule-runs", "POST", sampleGenerationJson)
      expect(res.status).toBe(code)
      const body = await res.json()
      expect(body.status).toBe(status)
      expect(body.run_id).toMatch(/^run_/)
      expect(body.result.status).toBe(status)
      const list = await (await a.request("/api/v0_2/schedule-runs")).json()
      expect(list.length, "engine-reached failures remain reviewable").toBe(1)
      expect(list[0].status).toBe(status)
    })
  }
})

describe("export routes", () => {
  test("CSV, ICS, and printable HTML read the run snapshot and are byte-stable", async () => {
    const a = await withPlanning()
    const created = await (await send(a, "/schedule-runs", "POST", sampleGenerationJson)).json()
    const base = `/api/v0_2/schedule-runs/${created.run_id}/export`

    const csv = await (await a.request(`${base}/csv`)).text()
    expect(csv.split("\r\n")[0]).toBe(
      "date,slot_id,slot_type,provider_id,provider_name,derived_call,weekend,holiday_id",
    )
    expect(csv, "CSV export is byte-stable").toBe(await (await a.request(`${base}/csv`)).text())

    const icsRes = await a.request(`${base}/ics`)
    expect(icsRes.headers.get("content-type")).toContain("text/calendar")
    const ics = await icsRes.text()
    expect(ics).toContain("BEGIN:VCALENDAR")
    expect(ics, "ICS export is byte-stable for a run snapshot").toBe(
      await (await a.request(`${base}/ics`)).text(),
    )

    const perProvider = await (await a.request(`${base}/ics?provider_id=dr_a`)).text()
    expect(perProvider, "per-provider ICS includes selected provider events").toContain("dr_a")
    expect(perProvider, "per-provider ICS excludes other provider events").not.toContain("dr_b")
    expect(perProvider.length, "per-provider ICS is a subset").toBeLessThanOrEqual(ics.length)

    const edited = {
      ...samplePlanningJson,
      providers: samplePlanningJson.providers.map((p) =>
        p.provider_id === "dr_a" ? { ...p, display_name: "dr_a_edited" } : p,
      ),
    }
    expect((await send(a, "/planning", "PUT", edited)).status, "live planning edit after run").toBe(200)
    const csvAfterPlanningEdit = await (await a.request(`${base}/csv`)).text()
    expect(csvAfterPlanningEdit, "export keeps the run snapshot provider name").toContain("dr_a")
    expect(csvAfterPlanningEdit, "export must not read the live edited planning name").not.toContain(
      "dr_a_edited",
    )

    const print = await a.request(`${base}/print`)
    expect(print.headers.get("content-type")).toContain("text/html")
    expect(await print.text()).toContain("<!doctype html>")
  })

  test("export of an unknown run is 404", async () => {
    expect((await app().request("/api/v0_2/schedule-runs/run_missing/export/csv")).status).toBe(404)
  })

  test("export routes reject malformed ids with 400 and unknown provider ids with 404", async () => {
    const a = await withPlanning()
    const created = await (await send(a, "/schedule-runs", "POST", sampleGenerationJson)).json()
    expect((await a.request("/api/v0_2/schedule-runs/%20/export/csv")).status).toBe(400)
    expect(
      (await a.request(`/api/v0_2/schedule-runs/${created.run_id}/export/ics?provider_id=%20`)).status,
    ).toBe(400)
    expect(
      (await a.request(`/api/v0_2/schedule-runs/${created.run_id}/export/ics?provider_id=provider_missing`))
        .status,
    ).toBe(404)
  })

  test("exporter snapshot defects return a structured 500 response", async () => {
    const db = openDatabase(":memory:")
    const a = createApp(db)
    const planning = samplePlanning()
    const compiled = compilePlanningScenario({ state: planning, generation: sampleGenerationJson })
    if (compiled.status !== "valid") throw new Error("sample planning must compile for export defect test")
    const result = fakeResult(compiled.scenario, "optimal")
    const run = insertScheduleRun(db, {
      planning,
      scenario: compiled.scenario,
      scenario_hash: compiled.scenario_hash,
      result: {
        ...result,
        scenario_hash: compiled.scenario_hash,
        assignments: [
          {
            date: compiled.scenario.horizon.start_date,
            slot_id: "corrupt",
            slot_type: "normal_first",
            provider_id: "missing" as ProviderId,
            derived_call: true,
            weekend: false,
            holiday_id: null,
          },
        ],
      },
    })

    const res = await a.request(`/api/v0_2/schedule-runs/${run.run_id}/export/csv`)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.status).toBe("export_error")
    expect(body.errors[0]).toContain("export invariant")
  })
})
