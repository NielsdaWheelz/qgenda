import { defineConfig } from "drizzle-kit"

// Owns migration generation: `bun run db:generate` regenerates packages/storage/src/migrations from
// schema.ts. Paths are relative to the repo root, where the command runs.
export default defineConfig({
  dialect: "sqlite",
  schema: "packages/storage/src/schema.ts",
  out: "packages/storage/src/migrations",
})
