import type { CompileDiagnostic } from "@qgenda/core/compiler/compileDiagnostics"
import { PlanningState } from "@qgenda/core/planning/planningSchema"
import { Schema } from "effect"
import {
  CompileError,
  CompileResponse,
  CreatedRun,
  type EditablePlanning,
  NotFoundError,
  PlanningError,
  RunDetail,
  RunSummary,
} from "./schemas"

// Typed fetch client: the only place the UI talks to the API. Every response is decoded at this boundary
// into owned types; failures carry compile diagnostics or messages the screens render.
const base = "/api/v0_2"
const json = { "content-type": "application/json" }

type Horizon = { start_date: string; end_date: string }
type SolverSettings = { max_seconds: number; random_seed: number; allow_feasible_result: boolean }
type ClientDecode<A> = { ok: true; value: A } | { ok: false; errors: readonly string[] }
export type UnexpectedResponseOutcome = { kind: "unexpected"; errors: readonly string[] }

const unexpectedResponse = (context: string): ClientDecode<never> => ({
  ok: false,
  errors: [`Unexpected API response while ${context}.`],
})

async function readJson(res: Response, context: string): Promise<ClientDecode<unknown>> {
  try {
    return { ok: true, value: await res.json() }
  } catch {
    return unexpectedResponse(context)
  }
}

function decodeBody<A, I>(schema: Schema.Schema<A, I>, body: unknown, context: string): ClientDecode<A> {
  const decoded = Schema.decodeUnknownEither(schema)(body, { onExcessProperty: "error" })
  return decoded._tag === "Right" ? { ok: true, value: decoded.right } : unexpectedResponse(context)
}

const unexpectedOutcome = (errors: readonly string[]): UnexpectedResponseOutcome => ({
  kind: "unexpected",
  errors,
})

export type PlanningLoadOutcome =
  | { ok: true; planning: EditablePlanning }
  | { ok: false; status: "unexpected_response"; errors: readonly string[] }

export async function getPlanning(): Promise<PlanningLoadOutcome> {
  const res = await fetch(`${base}/planning`)
  const body = await readJson(res, "loading planning")
  if (!body.ok) return { ok: false, status: "unexpected_response", errors: body.errors }
  const decoded = decodeBody(PlanningState, body.value, "loading planning")
  if (!decoded.ok) return { ok: false, status: "unexpected_response", errors: decoded.errors }
  return { ok: true, planning: Schema.encodeSync(PlanningState)(decoded.value) }
}

export async function putPlanning(state: EditablePlanning): Promise<{ ok: boolean; errors: string[] }> {
  const res = await fetch(`${base}/planning`, { method: "PUT", headers: json, body: JSON.stringify(state) })
  if (res.ok) return { ok: true, errors: [] }
  const body = await readJson(res, "saving planning")
  if (!body.ok) return { ok: false, errors: [...body.errors] }
  const parsed = decodeBody(PlanningError, body.value, "saving planning")
  if (parsed.ok)
    return {
      ok: false,
      errors: [...parsed.value.errors, ...parsed.value.diagnostics.map((d) => `${d.code}: ${d.message}`)],
    }
  return { ok: false, errors: [...parsed.errors] }
}

export type CompileOutcome =
  | { ok: true; summary: CompileResponse }
  | {
      ok: false
      status: "invalid_input" | "invalid_planning" | "unexpected_response"
      diagnostics: readonly CompileDiagnostic[]
      messages: readonly string[]
    }

export async function compile(horizon: Horizon): Promise<CompileOutcome> {
  const res = await fetch(`${base}/scenarios/compile`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ horizon }),
  })
  const body = await readJson(res, "compiling planning")
  if (!body.ok) return { ok: false, status: "unexpected_response", diagnostics: [], messages: body.errors }
  if (res.ok) {
    const decoded = decodeBody(CompileResponse, body.value, "compiling planning")
    return decoded.ok
      ? { ok: true, summary: decoded.value }
      : { ok: false, status: "unexpected_response", diagnostics: [], messages: decoded.errors }
  }
  const error = decodeBody(CompileError, body.value, "compiling planning")
  return error.ok
    ? {
        ok: false,
        status: error.value.status,
        diagnostics: error.value.diagnostics,
        messages: error.value.errors,
      }
    : { ok: false, status: "unexpected_response", diagnostics: [], messages: error.errors }
}

export type GenerateOutcome =
  | { kind: "created"; run: CreatedRun }
  | { kind: "engine"; run: CreatedRun }
  | UnexpectedResponseOutcome
  | { kind: "invalid"; diagnostics: readonly CompileDiagnostic[]; messages: readonly string[] }

export async function generate(input: {
  horizon: Horizon
  solver: SolverSettings
}): Promise<GenerateOutcome> {
  const res = await fetch(`${base}/schedule-runs`, {
    method: "POST",
    headers: json,
    body: JSON.stringify(input),
  })
  const body = await readJson(res, "generating schedule")
  if (!body.ok) return unexpectedOutcome(body.errors)
  if (res.status === 201) {
    const decoded = decodeBody(CreatedRun, body.value, "generating schedule")
    return decoded.ok ? { kind: "created", run: decoded.value } : unexpectedOutcome(decoded.errors)
  }
  const run = Schema.decodeUnknownEither(CreatedRun)(body.value, { onExcessProperty: "error" })
  if (run._tag === "Right") return { kind: "engine", run: run.right }
  const error = decodeBody(CompileError, body.value, "generating schedule")
  return error.ok
    ? { kind: "invalid", diagnostics: error.value.diagnostics, messages: error.value.errors }
    : unexpectedOutcome(error.errors)
}

export type ReplayOutcome =
  | { kind: "created"; run: CreatedRun }
  | { kind: "engine"; run: CreatedRun }
  | { kind: "not_found"; errors: readonly string[] }
  | UnexpectedResponseOutcome
  | { kind: "invalid"; diagnostics: readonly CompileDiagnostic[]; messages: readonly string[] }

export async function replayRun(runId: string): Promise<ReplayOutcome> {
  const res = await fetch(`${base}/schedule-runs/${runId}/replay`, { method: "POST" })
  const body = await readJson(res, "replaying run")
  if (!body.ok) return unexpectedOutcome(body.errors)
  if (res.status === 201) {
    const decoded = decodeBody(CreatedRun, body.value, "replaying run")
    return decoded.ok ? { kind: "created", run: decoded.value } : unexpectedOutcome(decoded.errors)
  }
  const run = Schema.decodeUnknownEither(CreatedRun)(body.value, { onExcessProperty: "error" })
  if (run._tag === "Right") return { kind: "engine", run: run.right }
  const notFound = Schema.decodeUnknownEither(NotFoundError)(body.value, { onExcessProperty: "error" })
  if (notFound._tag === "Right") return { kind: "not_found", errors: notFound.right.errors }
  const error = decodeBody(CompileError, body.value, "replaying run")
  return error.ok
    ? { kind: "invalid", diagnostics: error.value.diagnostics, messages: error.value.errors }
    : unexpectedOutcome(error.errors)
}

export type RunListOutcome =
  | { ok: true; runs: readonly RunSummary[] }
  | { ok: false; status: "unexpected_response"; errors: readonly string[] }

export async function listRuns(): Promise<RunListOutcome> {
  const res = await fetch(`${base}/schedule-runs`)
  const body = await readJson(res, "loading runs")
  if (!body.ok) return { ok: false, status: "unexpected_response", errors: body.errors }
  const decoded = decodeBody(Schema.Array(RunSummary), body.value, "loading runs")
  return decoded.ok
    ? { ok: true, runs: decoded.value }
    : { ok: false, status: "unexpected_response", errors: decoded.errors }
}

export type RunDetailOutcome =
  | { ok: true; detail: RunDetail }
  | { ok: false; status: "invalid_input" | "not_found" | "unexpected_response"; errors: readonly string[] }

export async function getRun(runId: string): Promise<RunDetailOutcome> {
  const res = await fetch(`${base}/schedule-runs/${runId}`)
  const body = await readJson(res, "loading run")
  if (!body.ok) return { ok: false, status: "unexpected_response", errors: body.errors }
  if (res.ok) {
    const decoded = decodeBody(RunDetail, body.value, "loading run")
    return decoded.ok
      ? { ok: true, detail: decoded.value }
      : { ok: false, status: "unexpected_response", errors: decoded.errors }
  }
  const notFound = Schema.decodeUnknownEither(NotFoundError)(body.value, { onExcessProperty: "error" })
  if (notFound._tag === "Right")
    return { ok: false, status: notFound.right.status, errors: notFound.right.errors }
  const error = decodeBody(CompileError, body.value, "loading run")
  return error.ok
    ? { ok: false, status: "invalid_input", errors: error.value.errors }
    : { ok: false, status: "unexpected_response", errors: error.errors }
}

export const exportUrl = (runId: string, kind: "print" | "csv" | "ics", providerId?: string): string =>
  `${base}/schedule-runs/${runId}/export/${kind}${providerId === undefined ? "" : `?provider_id=${encodeURIComponent(providerId)}`}`
