import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Local client dev/build. The client lives in src/client and imports workspace packages through their
// package exports. /api is proxied to the Bun/Hono server in dev.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { outDir: "dist" },
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
})
