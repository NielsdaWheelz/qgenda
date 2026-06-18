import { addIsoDays, monthEndIso } from "@qgenda/core/domain/calendar"
import type { IsoDate } from "@qgenda/core/domain/ids"
import { useEffect, useState } from "react"
import { listRuns } from "../api/client"
import type { RunSummary } from "../api/schemas"
import { runStatusLabel } from "../labels"
import { usePlanning } from "../state"

// Landing screen: workspace snapshot, missing-setup warnings, the newest run, and a link into Generate.
export function DashboardRoute() {
  const { planning, update } = usePlanning()
  const [runs, setRuns] = useState<
    | { kind: "loading" }
    | { kind: "loaded"; runs: readonly RunSummary[] }
    | { kind: "error"; errors: readonly string[] }
  >({ kind: "loading" })
  useEffect(() => {
    listRuns().then((outcome) =>
      setRuns(
        outcome.ok ? { kind: "loaded", runs: outcome.runs } : { kind: "error", errors: outcome.errors },
      ),
    )
  }, [])

  if (planning === null) return <p className="muted">Loading…</p>

  const latest = runs.kind === "loaded" ? runs.runs[0] : undefined
  const callEligible = planning.providers.filter((p) => p.call_eligible).length
  const recommended = recommendedHorizon(
    planning.workspace.active_cycle_start,
    planning.workspace.active_cycle_end,
    latest,
  )
  const setupIssues = [
    planning.providers.length === 0 ? { href: "#/roster", label: "No providers. Add providers" } : null,
    planning.providers.length > 0 && callEligible === 0
      ? { href: "#/roster", label: "No call-eligible providers. Update roster eligibility" }
      : null,
    planning.demand_templates.length === 0
      ? { href: "#/demand", label: "No demand templates. Add weekly demand" }
      : null,
    planning.providers.length > 0 &&
    !planning.workspace.opening_ledger_start_fresh &&
    planning.opening_ledger.length === 0
      ? {
          href: "#/roster",
          label: "Opening ledger is empty. Enter carry-forward debt or confirm start-fresh",
        }
      : null,
  ].filter((issue): issue is { href: string; label: string } => issue !== null)

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="panel">
        <h2>Workspace</h2>
        <div className="metric-grid">
          <div className="metric">
            <span className="label">Recommended horizon</span>
            <span className="value">
              {recommended.start}..{recommended.end}
            </span>
          </div>
          <div className="metric">
            <span className="label">Providers</span>
            <span className="value">
              {planning.providers.length} total, {callEligible} call
            </span>
          </div>
          <div className="metric">
            <span className="label">Demand templates</span>
            <span className="value">{planning.demand_templates.length}</span>
          </div>
        </div>
        <div className="toolbar">
          <label>
            Timezone
            <input
              value={planning.workspace.timezone}
              onChange={(e) =>
                update({ ...planning, workspace: { ...planning.workspace, timezone: e.target.value } })
              }
            />
          </label>
          <label>
            Active cycle start
            <input
              type="date"
              value={planning.workspace.active_cycle_start}
              onChange={(e) =>
                update({
                  ...planning,
                  workspace: { ...planning.workspace, active_cycle_start: e.target.value },
                })
              }
            />
          </label>
          <label>
            Active cycle end
            <input
              type="date"
              value={planning.workspace.active_cycle_end}
              onChange={(e) =>
                update({
                  ...planning,
                  workspace: { ...planning.workspace, active_cycle_end: e.target.value },
                })
              }
            />
          </label>
        </div>
      </div>

      <div className="panel">
        <h2>Setup readiness</h2>
        {setupIssues.length === 0 ? (
          <p className="ok">Basic setup is present. Use compile preview for full validation.</p>
        ) : (
          <ul className="error">
            {setupIssues.map((issue) => (
              <li key={issue.label}>
                <a href={issue.href}>{issue.label}</a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        {runs.kind === "error" ? (
          <ul className="error">
            {runs.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : latest === undefined ? (
          <p className="muted">No runs yet.</p>
        ) : (
          <p>
            Latest run: <a href={`#/runs/${latest.run_id}`}>{runStatusLabel(latest.status)}</a>
          </p>
        )}
      </div>

      <a href="#/generate">Generate schedule</a>
    </div>
  )
}

function recommendedHorizon(
  activeStart: string,
  activeEnd: string,
  latest?: RunSummary,
): { start: string; end: string } {
  const cycleStart = activeStart as IsoDate
  const cycleEnd = activeEnd as IsoDate
  const start = clampIso(
    latest === undefined ? cycleStart : addIsoDays(latest.horizon_end, 1),
    cycleStart,
    cycleEnd,
  )
  return { start, end: clampIso(monthEndIso(start), start, cycleEnd) }
}

function clampIso(date: IsoDate, min: IsoDate, max: IsoDate): IsoDate {
  if (date < min) return min
  if (date > max) return max
  return date
}
