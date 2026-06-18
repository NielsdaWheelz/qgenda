import type { Db } from "@qgenda/storage/db"
import { Hono } from "hono"
import { compileRoutes } from "./routes/compileRoutes"
import { exportRoutes } from "./routes/exportRoutes"
import { planningRoutes } from "./routes/planningRoutes"
import { type GenerateScheduleService, scheduleRunRoutes } from "./routes/scheduleRunRoutes"

// Builds the local API over an open database. All routes are thin adapters under /api/v0_2; the engine,
// compiler, and storage own the behavior. Takes the db as a parameter so tests drive a real in-memory
// database without the server process.
export function createApp(db: Db, services: { generateSchedule?: GenerateScheduleService } = {}) {
  const app = new Hono()
  app.route("/api/v0_2", planningRoutes(db))
  app.route("/api/v0_2", compileRoutes(db))
  app.route("/api/v0_2", scheduleRunRoutes(db, services))
  app.route("/api/v0_2", exportRoutes(db))
  return app
}
