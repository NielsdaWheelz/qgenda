import { ProviderId, RunId } from "@qgenda/core/domain/ids"
import { scheduleCsv } from "@qgenda/core/export/csv"
import { scheduleIcs } from "@qgenda/core/export/ics"
import { printableScheduleHtml } from "@qgenda/core/export/printableHtml"
import type { Db } from "@qgenda/storage/db"
import { getScheduleRun } from "@qgenda/storage/repositories/scheduleRunRepository"
import { Hono } from "hono"
import { decodeValue } from "../decodeValue"

// Exports read from an immutable run snapshot, never live planning state, and never recompute
// assignments (spec "Export"). Print is inline HTML; CSV and ICS download as files.
export function exportRoutes(db: Db) {
  const app = new Hono()
  const errorStatus = (status: 400 | 404) => (status === 400 ? "invalid_input" : "not_found")
  const exportFailure = (error: unknown) => ({
    status: "export_error" as const,
    errors: [error instanceof Error ? error.message : "Unknown export error."],
  })
  const load = (runId: string) => {
    const decoded = decodeValue(RunId, runId)
    if (!decoded.ok) return { ok: false as const, response: { status: 400 as const, errors: decoded.errors } }
    const run = getScheduleRun(db, decoded.value)
    if (run === null)
      return { ok: false as const, response: { status: 404 as const, errors: ["run not found"] } }
    return { ok: true as const, run }
  }

  app.get("/schedule-runs/:run_id/export/print", (c) => {
    const loaded = load(c.req.param("run_id"))
    if (!loaded.ok)
      return c.json(
        { status: errorStatus(loaded.response.status), errors: loaded.response.errors },
        loaded.response.status,
      )
    const { run } = loaded
    try {
      return c.html(
        printableScheduleHtml({
          result: run.result,
          scenario: run.compiled_scenario,
          runId: run.run_id,
          createdAt: run.created_at,
        }),
      )
    } catch (error) {
      return c.json(exportFailure(error), 500)
    }
  })

  app.get("/schedule-runs/:run_id/export/csv", (c) => {
    const loaded = load(c.req.param("run_id"))
    if (!loaded.ok)
      return c.json(
        { status: errorStatus(loaded.response.status), errors: loaded.response.errors },
        loaded.response.status,
      )
    const { run } = loaded
    try {
      return new Response(scheduleCsv(run.result, run.compiled_scenario), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="schedule-${run.run_id}.csv"`,
        },
      })
    } catch (error) {
      return c.json(exportFailure(error), 500)
    }
  })

  app.get("/schedule-runs/:run_id/export/ics", (c) => {
    const loaded = load(c.req.param("run_id"))
    if (!loaded.ok)
      return c.json(
        { status: errorStatus(loaded.response.status), errors: loaded.response.errors },
        loaded.response.status,
      )
    const { run } = loaded
    const providerId = c.req.query("provider_id")
    const base = {
      result: run.result,
      scenario: run.compiled_scenario,
      runId: run.run_id,
      createdAt: run.created_at,
    }
    const decodedProvider = providerId === undefined ? undefined : decodeValue(ProviderId, providerId)
    if (decodedProvider !== undefined && !decodedProvider.ok)
      return c.json({ status: "invalid_input", errors: decodedProvider.errors }, 400)
    if (
      decodedProvider !== undefined &&
      !run.compiled_scenario.providers.some((p) => p.id === decodedProvider.value)
    )
      return c.json({ status: "not_found", errors: ["provider not found in run"] }, 404)
    try {
      const ics = scheduleIcs(
        decodedProvider === undefined ? base : { ...base, providerId: decodedProvider.value },
      )
      return new Response(ics, {
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": `attachment; filename="schedule-${run.run_id}.ics"`,
        },
      })
    } catch (error) {
      return c.json(exportFailure(error), 500)
    }
  })

  return app
}
