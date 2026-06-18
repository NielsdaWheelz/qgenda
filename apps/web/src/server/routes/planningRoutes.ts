import { PlanningState } from "@qgenda/core/planning/planningSchema"
import { validatePlanningState } from "@qgenda/core/planning/planningValidation"
import type { Db } from "@qgenda/storage/db"
import { getPlanning, replacePlanning } from "@qgenda/storage/repositories/planningRepository"
import { Hono } from "hono"
import { decodeBody } from "../decodeBody"

// Whole-state planning bootstrap (spec "Planning Bootstrap"). GET returns the editable state (a bootstrap
// default before anything is saved); PUT validates and atomically replaces it. A dangling reference
// surfaces from the repository foreign keys as invalid planning input.
const DEFAULT_PLANNING = {
  workspace: {
    schema_version: "v0.2",
    workspace_id: "local",
    timezone: "America/Los_Angeles",
    active_cycle_start: "2026-01-01",
    active_cycle_end: "2026-12-31",
    opening_ledger_start_fresh: false,
  },
  providers: [],
  unavailability: [],
  demand_templates: [],
  date_exceptions: [],
  holidays: [],
  weekend_blocks: [],
  opening_ledger: [],
}

export function planningRoutes(db: Db) {
  const app = new Hono()

  app.get("/planning", (c) => c.json(getPlanning(db) ?? DEFAULT_PLANNING))

  app.put("/planning", async (c) => {
    const decoded = decodeBody(PlanningState, await c.req.json().catch(() => null))
    if (!decoded.ok) return c.json({ status: "invalid_planning", errors: decoded.errors }, 400)
    const diagnostics = validatePlanningState(decoded.value)
    const errors = diagnostics.filter((d) => d.severity === "error")
    if (errors.length > 0) return c.json({ status: "invalid_planning", diagnostics: errors }, 400)
    try {
      replacePlanning(db, decoded.value)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (!/constraint|foreign key/i.test(message)) throw e
      return c.json({ status: "invalid_planning", errors: [`storage constraint: ${message}`] }, 400)
    }
    return c.json(decoded.value)
  })

  return app
}
