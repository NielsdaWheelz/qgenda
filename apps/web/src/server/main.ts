#!/usr/bin/env bun
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { openDatabase } from "@qgenda/storage/db"
import { serveStatic } from "hono/bun"
import { createApp } from "./http"

// Local server entrypoint: open (and migrate) the SQLite database, mount the API, and serve the built
// client from ./dist with an SPA fallback. The only startup side effects live here.
const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const dbDir = join(appRoot, ".local")
mkdirSync(dbDir, { recursive: true })
const db = openDatabase(join(dbDir, "qgenda.sqlite"))
const app = createApp(db)
app.get("/favicon.ico", () => new Response(null, { status: 204 }))
app.use("/*", serveStatic({ root: join(appRoot, "dist") }))
app.get("*", serveStatic({ path: join(appRoot, "dist", "index.html") }))

const port = Number(process.env.PORT ?? 8787)
console.log(`qgenda v0.2 running at http://localhost:${port}`)
export default { port, fetch: app.fetch }
