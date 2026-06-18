import { randomUUID } from "node:crypto"
import { unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SolveOutcome, Solver } from "../Solver"
import { decodeAssignments } from "./decodeSolution"
import { encodeScenario } from "./encodeScenario"

// MiniZinc adapter for the Solver port. Builds data, invokes OR-Tools CP-SAT deterministically
// (-p 1), parses its NDJSON output, and maps backend status to typed outcomes. CP-SAT is the
// preferred backend: it proves optimality on this objective, which Gecode cannot. Expected solver
// results never throw.

const BACKEND = "ortools"
const MODEL_PATH = join(import.meta.dir, "model", "schedule.mzn")

export const solveWithMiniZinc: Solver = async (input) => {
  const dataPath = join(tmpdir(), `qgenda-${process.pid}-${randomUUID()}.json`)
  await writeFile(dataPath, JSON.stringify(encodeScenario(input)))

  const args = [
    "minizinc",
    "--solver",
    "cp-sat",
    "--json-stream",
    "--output-mode",
    "json",
    "--output-objective",
    "-f", // free search: let CP-SAT use its own strategy. Without it the fixed search fails to prove optimality.
    "-p",
    "1",
    "--random-seed",
    String(input.config.random_seed),
    "--time-limit",
    String(Math.round(input.config.max_seconds * 1000)),
    MODEL_PATH,
    dataPath,
  ]

  const startedAt = performance.now()
  try {
    const proc = spawn(args)
    if (proc === null) return { _tag: "Unavailable", detail: "minizinc binary not found" }
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    const wallSeconds = (performance.now() - startedAt) / 1000
    return mapOutput(input, stdout, stderr, exitCode, wallSeconds)
  } finally {
    // justify-ignore-error: best-effort temp cleanup; a failed unlink of an os.tmpdir file must not fail the solve.
    await unlink(dataPath).catch(() => {})
  }
}

function spawn(args: string[]) {
  try {
    return Bun.spawn(args, { stdout: "pipe", stderr: "pipe" })
  } catch {
    return null
  }
}

type SolverJson = { assign: number[]; _objective: number }
type SolverEvent = { type?: string; status?: string; output?: { json?: unknown } }

function mapOutput(
  input: Parameters<Solver>[0],
  stdout: string,
  stderr: string,
  exitCode: number,
  wallSeconds: number,
): SolveOutcome {
  let solution: SolverJson | null = null
  let status: string | null = null
  let sawError = false

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "") continue
    let raw: unknown
    try {
      raw = JSON.parse(trimmed)
    } catch {
      return { _tag: "OutputError", detail: `unparseable solver output line: ${trimmed}`, wallSeconds }
    }
    const event = decodeEvent(raw)
    if (typeof event === "string")
      return { _tag: "OutputError", detail: `invalid solver event: ${event}`, wallSeconds }
    if (event.type === "solution" && event.output?.json !== undefined) {
      const decoded = decodeSolverJson(event.output.json, input.slots.length, input.scenario.providers.length)
      if (typeof decoded === "string")
        return { _tag: "OutputError", detail: `invalid solver solution: ${decoded}`, wallSeconds }
      solution = decoded
    } else if (event.type === "status" && event.status !== undefined) status = event.status
    else if (event.type === "error") sawError = true
  }

  // A model/parse error or non-zero exit is an unexpected solver failure.
  if (sawError || exitCode !== 0) {
    return {
      _tag: "OutputError",
      detail: `solver exit ${exitCode}, status ${status ?? "none"}: ${(stdout || stderr).slice(0, 500)}`,
      wallSeconds,
    }
  }

  const solved = (proven: boolean): SolveOutcome => {
    if (solution === null)
      return { _tag: "Unknown", backend: BACKEND, status: status ?? "UNKNOWN", wallSeconds }
    try {
      return {
        _tag: "Solved",
        proven,
        assignments: decodeAssignments(input, solution),
        objective: solution._objective,
        backend: BACKEND,
        status: status ?? "UNKNOWN",
        wallSeconds,
      }
    } catch (e) {
      return {
        _tag: "OutputError",
        detail: `solver assignment decode failed: ${e instanceof Error ? e.message : e}`,
        wallSeconds,
      }
    }
  }

  // OPTIMAL_SOLUTION/ALL_SOLUTIONS prove optimality. UNSATISFIABLE is infeasible. On a time-limit the
  // backend emits its best solution (if any) with status UNKNOWN or none; that solution is unproven.
  if (status === "OPTIMAL_SOLUTION" || status === "ALL_SOLUTIONS") return solved(true)
  if (status === "UNSATISFIABLE") return { _tag: "Infeasible", backend: BACKEND, status, wallSeconds }
  if (status === "UNKNOWN" || status === null) return solved(false)
  return { _tag: "OutputError", detail: `unexpected solver status ${status}`, wallSeconds }
}

function decodeEvent(raw: unknown): SolverEvent | string {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return "event is not an object"
  const event = raw as Record<string, unknown>
  if ("type" in event && event.type !== undefined && typeof event.type !== "string")
    return "type is not a string"
  if ("status" in event && event.status !== undefined && typeof event.status !== "string")
    return "status is not a string"
  const type = typeof event.type === "string" ? event.type : undefined
  const status = typeof event.status === "string" ? event.status : undefined
  const base = { ...(type === undefined ? {} : { type }), ...(status === undefined ? {} : { status }) }
  if ("output" in event && event.output !== undefined) {
    if (event.output === null || typeof event.output !== "object" || Array.isArray(event.output))
      return "output is not an object"
    return { ...base, output: event.output as { json?: unknown } }
  }
  return base
}

function decodeSolverJson(raw: unknown, slotCount: number, providerCount: number): SolverJson | string {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return "solution json is not an object"
  const solution = raw as Record<string, unknown>
  if (!Array.isArray(solution.assign)) return "assign is not an array"
  if (solution.assign.length !== slotCount)
    return `assign length ${solution.assign.length} does not match slot count ${slotCount}`
  for (const [i, value] of solution.assign.entries()) {
    if (!Number.isInteger(value)) return `assign[${i}] is not an integer`
    if (value < 1 || value > providerCount)
      return `assign[${i}] provider index ${value} outside 1..${providerCount}`
  }
  if (typeof solution._objective !== "number" || !Number.isFinite(solution._objective))
    return "_objective is not a finite number"
  return { assign: solution.assign, _objective: solution._objective }
}
