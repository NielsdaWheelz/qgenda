#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { chromium } from "playwright"

function run(command: string, args: string[]): { ok: true; stdout: string } | { ok: false; message: string } {
  const proc = Bun.spawnSync([command, ...args], { stdout: "pipe", stderr: "pipe" })
  if (proc.exitCode !== 0) {
    return {
      ok: false,
      message: `${command} ${args.join(" ")} failed with exit ${proc.exitCode}: ${proc.stderr.toString()}`,
    }
  }
  return { ok: true, stdout: proc.stdout.toString() }
}

const solvers = run("minizinc", ["--solvers"])
if (!solvers.ok) {
  console.error(solvers.message)
  console.error("Install the MiniZinc bundle from README.md and put .tools/minizinc/bin on PATH.")
  process.exit(1)
}

if (!/\bcp-sat\b/i.test(solvers.stdout)) {
  console.error("MiniZinc is available, but the OR-Tools CP-SAT backend is not visible.")
  console.error("Install the MiniZinc bundle from README.md and export PATH=\"$PWD/.tools/minizinc/bin:$PATH\".")
  process.exit(1)
}

const chromiumPath = chromium.executablePath()
if (!existsSync(chromiumPath)) {
  console.error(`Playwright Chromium is missing at ${chromiumPath}.`)
  console.error("Run `bunx playwright install chromium`.")
  process.exit(1)
}

console.log("preflight ok: MiniZinc CP-SAT and Playwright Chromium are available")
