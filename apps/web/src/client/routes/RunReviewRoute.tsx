import { useEffect, useState } from "react"
import { getRun, listRuns, type ReplayOutcome, type RunDetailOutcome, replayRun } from "../api/client"
import type { RunDetail, RunSummary } from "../api/schemas"
import { CalendarGrid } from "../components/CalendarGrid"
import { ExportMenu } from "../components/ExportMenu"
import { ProviderDayGrid } from "../components/ProviderDayGrid"
import { ScorecardPanel } from "../components/ScorecardPanel"
import { runStatusLabel } from "../labels"

// Runs screen: the run list when runId is null, otherwise one run's header, exports, calendar, and
// scorecard. Infeasible/error runs carry no assignments, so we show their warnings instead.
export function RunReviewRoute({ runId }: { runId: string | null }) {
  if (runId === null) return <RunList />
  return <RunView runId={runId} />
}

function RunList() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "loaded"; runs: readonly RunSummary[] }
    | { kind: "error"; errors: readonly string[] }
  >({ kind: "loading" })
  useEffect(() => {
    listRuns().then((outcome) =>
      setState(
        outcome.ok ? { kind: "loaded", runs: outcome.runs } : { kind: "error", errors: outcome.errors },
      ),
    )
  }, [])

  if (state.kind === "loading") return <p className="muted">Loading…</p>
  if (state.kind === "error")
    return (
      <div>
        <h1>Runs unavailable</h1>
        <ul className="error">
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </div>
    )
  const { runs } = state
  if (runs.length === 0)
    return (
      <p className="muted">
        No runs yet. <a href="#/generate">Generate a schedule</a>
      </p>
    )
  return (
    <div>
      <h1>Runs</h1>
      <table>
        <thead>
          <tr>
            <th>Created</th>
            <th>Horizon</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.run_id}>
              <td>{run.created_at}</td>
              <td>
                {run.horizon_start} → {run.horizon_end}
              </td>
              <td>
                <a href={`#/runs/${run.run_id}`}>{runStatusLabel(run.status)}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RunView({ runId }: { runId: string }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "loaded"; detail: RunDetail }
    | { kind: "error"; outcome: Extract<RunDetailOutcome, { ok: false }> }
  >({ kind: "loading" })
  const [replayState, setReplayState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "done"; outcome: Extract<ReplayOutcome, { kind: "created" | "engine" }> }
    | { kind: "error"; outcome: Extract<ReplayOutcome, { kind: "invalid" | "not_found" | "unexpected" }> }
  >({ kind: "idle" })
  useEffect(() => {
    let cancelled = false
    setState({ kind: "loading" })
    setReplayState({ kind: "idle" })
    getRun(runId).then((outcome) => {
      if (cancelled) return
      setState(outcome.ok ? { kind: "loaded", detail: outcome.detail } : { kind: "error", outcome })
    })
    return () => {
      cancelled = true
    }
  }, [runId])

  if (state.kind === "loading") return <p className="muted">Loading…</p>
  if (state.kind === "error")
    return (
      <div>
        <h1>{runDetailErrorTitle(state.outcome.status)}</h1>
        <ul className="error">
          {state.outcome.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
        <a href="#/runs">Back to runs</a>
      </div>
    )
  const { detail } = state
  const runReplay = () => {
    setReplayState({ kind: "running" })
    replayRun(detail.run_id).then((outcome) => {
      if (outcome.kind === "created" || outcome.kind === "engine") setReplayState({ kind: "done", outcome })
      else setReplayState({ kind: "error", outcome })
    })
  }
  return (
    <div>
      <h1>{runStatusLabel(detail.status)}</h1>
      <p className="muted">
        {detail.horizon_start} → {detail.horizon_end} · {detail.compiled_scenario_hash}
      </p>
      <div className="toolbar">
        <button type="button" className="ghost" onClick={runReplay} disabled={replayState.kind === "running"}>
          {replayState.kind === "running" ? "Replaying…" : "Replay snapshot"}
        </button>
        {replayState.kind === "done" ? (
          <span className="ok">
            Replayed as{" "}
            <a href={`#/runs/${replayState.outcome.run.run_id}`}>
              {runStatusLabel(replayState.outcome.run.status)}
            </a>
          </span>
        ) : replayState.kind === "error" ? (
          <span className="error">
            {replayState.outcome.kind === "not_found" || replayState.outcome.kind === "unexpected"
              ? replayState.outcome.errors.join("; ")
              : [
                  ...replayState.outcome.messages,
                  ...replayState.outcome.diagnostics.map((d) => d.message),
                ].join("; ")}
          </span>
        ) : null}
      </div>
      {detail.result.assignments.length > 0 ? (
        <>
          <ExportMenu runId={detail.run_id} providers={detail.providers} />
          <CalendarGrid
            result={detail.result}
            providers={detail.providers}
            horizon={{ start_date: detail.horizon_start, end_date: detail.horizon_end }}
            days={detail.days}
          />
          <ProviderDayGrid
            result={detail.result}
            providers={detail.providers}
            horizon={{ start_date: detail.horizon_start, end_date: detail.horizon_end }}
          />
          <ScorecardPanel
            scorecard={detail.result.scorecard}
            providers={detail.providers}
            hardRuleReport={detail.result.hard_rule_report}
            status={detail.status}
            openingLedger={detail.opening_ledger}
            openingLedgerStartFresh={detail.opening_ledger_start_fresh}
          />
        </>
      ) : (
        <>
          <h2>Generation diagnostics</h2>
          <ul className="error">
            {detail.result.warnings.length === 0 ? (
              <li>No assignment output was produced.</li>
            ) : (
              detail.result.warnings.map((w) => <li key={w}>{w}</li>)
            )}
          </ul>
          <ScorecardPanel
            scorecard={detail.result.scorecard}
            providers={detail.providers}
            hardRuleReport={detail.result.hard_rule_report}
            status={detail.status}
            openingLedger={detail.opening_ledger}
            openingLedgerStartFresh={detail.opening_ledger_start_fresh}
          />
        </>
      )}
    </div>
  )
}

function runDetailErrorTitle(status: Extract<RunDetailOutcome, { ok: false }>["status"]): string {
  switch (status) {
    case "not_found":
      return "Run not found"
    case "invalid_input":
      return "Invalid run id"
    case "unexpected_response":
      return "Run unavailable"
  }
}
