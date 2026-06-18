import { compilePlanningScenario } from "@qgenda/core/compiler/compilePlanningScenario"
import { GenerationRequest } from "@qgenda/core/planning/planningSchema"
import type { Db } from "@qgenda/storage/db"
import { getPlanning } from "@qgenda/storage/repositories/planningRepository"
import { Hono } from "hono"
import { decodeBody } from "../decodeBody"

// Compile preview (spec "Compile Preview"). Returns a summary plus diagnostics when the planning state
// compiles, or 400 with the blocking diagnostics. It never creates a run and never returns raw engine
// JSON to the UI.
export function compileRoutes(db: Db) {
  const app = new Hono()

  app.post("/scenarios/compile", async (c) => {
    const decoded = decodeBody(GenerationRequest, await c.req.json().catch(() => null))
    if (!decoded.ok) return c.json({ status: "invalid_planning", errors: decoded.errors }, 400)
    const planning = getPlanning(db)
    if (planning === null)
      return c.json({ status: "invalid_planning", errors: ["No planning state saved yet."] }, 400)

    const result = compilePlanningScenario({ state: planning, generation: decoded.value })
    if (result.status === "invalid_input")
      return c.json({ status: "invalid_planning", diagnostics: result.diagnostics }, 400)

    const { scenario, scenario_hash, diagnostics } = result
    return c.json({
      status: "valid",
      scenario_hash,
      horizon: scenario.horizon,
      counts: {
        days: scenario.days.length,
        providers: scenario.providers.length,
        holidays: scenario.holidays.length,
        weekend_blocks: scenario.weekend_blocks.length,
      },
      diagnostics,
    })
  })

  return app
}
