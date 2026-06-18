#!/usr/bin/env bun
// Dev orchestrator: run the API server and the Vite dev server together; either exiting stops both.
const server = Bun.spawn(["bun", "run", "src/server/main.ts"], { stdout: "inherit", stderr: "inherit" })
const vite = Bun.spawn(["bunx", "vite"], { stdout: "inherit", stderr: "inherit" })
const shutdown = () => {
  server.kill()
  vite.kill()
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
await Promise.race([server.exited, vite.exited])
shutdown()

export {}
