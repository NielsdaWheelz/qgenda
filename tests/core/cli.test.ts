import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// The CLI is exercised as a real subprocess (no internal imports), proving the
// adapter's file I/O, table rendering, and status-to-exit-code mapping end to end.

const repoRoot = join(import.meta.dir, "..", "..")
const scenario = (name: string) => join(repoRoot, "examples", "scenarios", name)

// One temp dir per test run, cleaned up afterwards; each helper makes a unique path.
const workDir = mkdtempSync(join(tmpdir(), "qgenda-cli-"))
let counter = 0
const tmpPath = (suffix: string) => join(workDir, `${counter++}-${suffix}`)

type Run = { code: number; stdout: string; stderr: string }

const runCli = async (args: string[]): Promise<Run> => {
  const proc = Bun.spawn([process.execPath, "run", "packages/core/src/cli/main.ts", ...args], {
    cwd: repoRoot,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

const readResult = (path: string) => JSON.parse(readFileSync(path, "utf8"))

describe("qgenda CLI", () => {
  test("exits 2 with usage when no scenario path is provided", async () => {
    const { code, stderr } = await runCli([])
    expect(code).toBe(2)
    expect(stderr).toContain("usage: qgenda-solve")
  })

  test("writes an optimal result file and exits 0 for month-basic --out", async () => {
    const out = tmpPath("basic.json")
    const { code, stderr } = await runCli([scenario("month-basic.json"), "--out", out])
    expect(code, `expected exit 0 for optimal; stderr: ${stderr}`).toBe(0)
    const result = readResult(out)
    expect(result.status, `result file should report optimal, got ${result.status}`).toBe("optimal")
  })

  test("prints a status line and assignments section for month-basic --table", async () => {
    const { code, stdout, stderr } = await runCli([scenario("month-basic.json"), "--table"])
    expect(code, `expected exit 0; stderr: ${stderr}`).toBe(0)
    expect(stdout, `table output should announce optimal status; stdout:\n${stdout}`).toContain(
      "status: optimal",
    )
    expect(stdout, `table output should include an assignments section; stdout:\n${stdout}`).toContain(
      "assignments:",
    )
  })

  test("exits 1 and writes an infeasible result for month-infeasible-post-call", async () => {
    const out = tmpPath("infeasible.json")
    const { code } = await runCli([scenario("month-infeasible-post-call.json"), "--out", out])
    expect(code, "an infeasible scenario should map to exit code 1").toBe(1)
    const result = readResult(out)
    expect(result.status, `result file should report infeasible, got ${result.status}`).toBe("infeasible")
  })

  test("exits 1 and reports invalid_input for a scenario with an unknown field", async () => {
    const badPath = tmpPath("bad.json")
    writeFileSync(badPath, JSON.stringify({ schema_version: "v0.1", scenario_id: "x", bogus: 1 }))
    const out = tmpPath("bad-out.json")
    const { code } = await runCli([badPath, "--out", out])
    expect(code, "invalid input should map to exit code 1").toBe(1)
    const result = readResult(out)
    expect(result.status, `result file should report invalid_input, got ${result.status}`).toBe(
      "invalid_input",
    )
  })

  test("exits 1 for the invalid eye-eligibility fixture", async () => {
    const out = tmpPath("invalid-eye.json")
    const { code } = await runCli([scenario("month-invalid-eye.json"), "--out", out])
    expect(code, "invalid eye fixture should map to exit code 1").toBe(1)
    const result = readResult(out)
    expect(result.status).toBe("invalid_input")
    expect(result.warnings.some((w: string) => w.startsWith("H_EYE_ELIGIBILITY:"))).toBe(true)
  })

  test("exits 1 for the invalid capacity fixture", async () => {
    const out = tmpPath("invalid-capacity.json")
    const { code } = await runCli([scenario("month-invalid-capacity.json"), "--out", out])
    expect(code, "invalid capacity fixture should map to exit code 1").toBe(1)
    const result = readResult(out)
    expect(result.status).toBe("invalid_input")
    expect(result.warnings.some((w: string) => w.startsWith("H_ROOM_CAPACITY:"))).toBe(true)
  })

  test("prints result JSON to stdout when --out is omitted", async () => {
    const { code, stdout } = await runCli([scenario("month-invalid-eye.json")])
    expect(code).toBe(1)
    expect(JSON.parse(stdout).status).toBe("invalid_input")
  })

  test("--pretty writes indented JSON", async () => {
    const out = tmpPath("pretty-invalid.json")
    const { code } = await runCli([scenario("month-invalid-capacity.json"), "--out", out, "--pretty"])
    expect(code).toBe(1)
    expect(readFileSync(out, "utf8")).toStartWith("{\n  ")
  })

  test("passes --strict when the schedule is optimal", async () => {
    const out = tmpPath("strict.json")
    const { code, stderr } = await runCli([scenario("month-basic.json"), "--out", out, "--strict"])
    expect(code, `optimal schedule should pass --strict; stderr: ${stderr}`).toBe(0)
    const result = readResult(out)
    expect(result.status, `result file should report optimal under --strict, got ${result.status}`).toBe(
      "optimal",
    )
  })
})

// Clean up the shared work dir after the whole file completes.
process.on("exit", () => {
  rmSync(workDir, { recursive: true, force: true })
})
