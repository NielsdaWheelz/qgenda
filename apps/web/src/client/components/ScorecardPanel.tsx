import type { OpeningLedger } from "@qgenda/core/domain/scenario"
import type { LedgerRow, ScheduleResult, Scorecard } from "@qgenda/core/domain/schedule"
import { providerLabel } from "../labels"

// Display-only fairness view: renders the numbers the engine already computed in the scorecard and
// hard-rule report. It formats with toFixed and never recomputes rule truth or fairness.
export function ScorecardPanel({
  scorecard,
  providers,
  hardRuleReport,
  status,
  openingLedger = [],
  openingLedgerStartFresh,
}: {
  scorecard: Scorecard
  providers: readonly { id: string; display_name: string }[]
  hardRuleReport: ScheduleResult["hard_rule_report"]
  status?: ScheduleResult["status"]
  openingLedger?: readonly OpeningLedger[]
  openingLedgerStartFresh?: boolean
}) {
  const hasSchedule = status === undefined || status === "optimal" || status === "feasible"
  const objectiveRows = Object.entries(scorecard.objective_contributions)
  return (
    <div>
      {hardRuleReport.violation_count === 0 && hasSchedule ? (
        <p className="ok">No hard-rule violations</p>
      ) : hardRuleReport.violation_count === 0 ? (
        <p className="muted">No hard-rule report was produced because this run has no schedule.</p>
      ) : (
        <ul className="error">
          {hardRuleReport.violations.map((v) => (
            <li key={`${v.rule_id}:${v.detail}`} className="error">
              {v.rule_id}: {v.detail}
            </li>
          ))}
        </ul>
      )}

      <h2>Opening fairness debt</h2>
      {openingLedger.length === 0 ? (
        <p className="muted">
          {openingLedgerStartFresh === true
            ? "No opening debt was carried into this run; the cycle was started fresh."
            : "No opening debt was carried into this run."}
        </p>
      ) : (
        <div className="wide-table">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Call burden</th>
                <th>Weekend burden</th>
                <th>Holiday burden</th>
                <th>First</th>
                <th>Second</th>
                <th>Middle</th>
                <th>Last</th>
                <th>Eye</th>
                <th>Dental</th>
              </tr>
            </thead>
            <tbody>
              {openingLedger.map((row) => (
                <tr key={row.provider_id}>
                  <td>{providerLabel(providers, row.provider_id)}</td>
                  <td>{fmt(row.call_burden)}</td>
                  <td>{fmt(row.weekend_burden)}</td>
                  <td>{fmt(row.holiday_burden)}</td>
                  <td>{row.first_count}</td>
                  <td>{row.second_count}</td>
                  <td>{row.middle_count}</td>
                  <td>{row.last_count}</td>
                  <td>{row.eye_count}</td>
                  <td>{row.dental_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Fairness ledger</h2>
      {scorecard.providers.length === 0 ? (
        <p className="muted">No fairness data.</p>
      ) : (
        <div className="wide-table">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>FTE</th>
                <th>Workdays</th>
                <th>Call</th>
                <th>Call burden</th>
                <th>Target call burden</th>
                <th>Call delta</th>
                <th>Weekend</th>
                <th>Weekend burden</th>
                <th>Holiday</th>
                <th>Holiday burden</th>
                <th>First</th>
                <th>Second</th>
                <th>Middle</th>
                <th>Last</th>
                <th>Eye</th>
                <th>Dental</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.providers.map((row) => (
                <tr key={row.provider_id}>
                  <td>{providerLabel(providers, row.provider_id)}</td>
                  <td>{fmt(row.fte)}</td>
                  <td>{row.workday_count}</td>
                  <td>{row.call_count}</td>
                  <td>{fmt(row.call_burden)}</td>
                  <td>{fmt(row.target_call_burden)}</td>
                  <td>{signed(row.call_delta)}</td>
                  <td>{row.weekend_count}</td>
                  <td>{fmt(row.weekend_burden)}</td>
                  <td>{row.holiday_count}</td>
                  <td>{fmt(row.holiday_burden)}</td>
                  <td>{row.first_count}</td>
                  <td>{row.second_count}</td>
                  <td>{row.middle_count}</td>
                  <td>{row.last_count}</td>
                  <td>{row.eye_count}</td>
                  <td>{row.dental_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scorecard.providers.length > 0 && (
        <>
          <h2>Fairness targets and deltas</h2>
          <div className="wide-table">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Ledger</th>
                  <th>Actual</th>
                  <th>Target</th>
                  <th>Delta</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.providers.flatMap((row) =>
                  TARGET_DELTA_ROWS.map(([label, actualKey, targetKey, deltaKey]) => (
                    <tr key={`${row.provider_id}:${label}`}>
                      <td>{providerLabel(providers, row.provider_id)}</td>
                      <td>{label}</td>
                      <td>{fmt(row[actualKey])}</td>
                      <td>{fmt(row[targetKey])}</td>
                      <td>{signed(row[deltaKey])}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Fairness spread</h2>
      <div className="metric-grid">
        <Metric label="Largest + call delta" value={signed(scorecard.largest_positive_delta)} />
        <Metric label="Largest - call delta" value={signed(scorecard.largest_negative_delta)} />
        <Metric label="Call burden spread" value={fmt(scorecard.aggregates.call_burden.spread)} />
        <Metric label="Workday spread" value={fmt(scorecard.aggregates.workday_count.spread)} />
      </div>
      <div className="wide-table">
        <table>
          <thead>
            <tr>
              <th>Ledger</th>
              <th>Min</th>
              <th>Max</th>
              <th>Spread</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {AGGREGATE_ROWS.map(([key, label]) => {
              const stat = scorecard.aggregates[key]
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td>{fmt(stat.min)}</td>
                  <td>{fmt(stat.max)}</td>
                  <td>{fmt(stat.spread)}</td>
                  <td>{fmt(stat.variance)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2>Excluded pools</h2>
      <dl className="summary-list">
        <dt>Call</dt>
        <dd>{providerList(providers, scorecard.excluded_pools.call)}</dd>
        <dt>Eye</dt>
        <dd>{providerList(providers, scorecard.excluded_pools.eye)}</dd>
        <dt>Dental</dt>
        <dd>{providerList(providers, scorecard.excluded_pools.dental)}</dd>
      </dl>

      <h2>Objective contributions</h2>
      {objectiveRows.length === 0 ? (
        <p className="muted">No objective contribution data.</p>
      ) : (
        <div className="wide-table">
          <table>
            <thead>
              <tr>
                <th>Soft rule</th>
                <th>Contribution</th>
              </tr>
            </thead>
            <tbody>
              {objectiveRows.map(([ruleId, value]) => (
                <tr key={ruleId}>
                  <td>{ruleId}</td>
                  <td>{fmt(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Cluster metrics</h2>
      <p>
        Consecutive-call violations: {scorecard.clusters.consecutive_call_violations} · Post-call violations:{" "}
        {scorecard.clusters.post_call_violations}
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Max consecutive workdays</th>
            <th>Workday run distribution</th>
            <th>Weekend blocks</th>
            <th>Consecutive weekend blocks</th>
            <th>Call spacing min</th>
            <th>Call spacing avg</th>
          </tr>
        </thead>
        <tbody>
          {scorecard.clusters.providers.map((row) => (
            <tr key={row.provider_id}>
              <td>{providerLabel(providers, row.provider_id)}</td>
              <td>{row.max_consecutive_workdays}</td>
              <td>{row.workday_run_distribution.join(", ") || "—"}</td>
              <td>{row.weekend_blocks_assigned}</td>
              <td>{row.consecutive_weekend_blocks}</td>
              <td>{row.call_spacing_min === null ? "—" : row.call_spacing_min}</td>
              <td>{row.call_spacing_avg === null ? "—" : fmt(row.call_spacing_avg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const AGGREGATE_ROWS = [
  ["call_burden", "Call burden"],
  ["weekend_burden", "Weekend burden"],
  ["holiday_burden", "Holiday burden"],
  ["first_count", "First"],
  ["second_count", "Second"],
  ["middle_count", "Middle"],
  ["last_count", "Last"],
  ["eye_count", "Eye"],
  ["dental_count", "Dental"],
  ["workday_count", "Workday"],
] as const satisfies readonly (readonly [keyof Scorecard["aggregates"], string])[]

const TARGET_DELTA_ROWS = [
  ["Call burden", "call_burden", "target_call_burden", "call_delta"],
  ["Weekend burden", "weekend_burden", "target_weekend_burden", "weekend_delta"],
  ["Holiday burden", "holiday_burden", "target_holiday_burden", "holiday_delta"],
  ["First", "first_count", "target_first_count", "first_delta"],
  ["Second", "second_count", "target_second_count", "second_delta"],
  ["Middle", "middle_count", "target_middle_count", "middle_delta"],
  ["Last", "last_count", "target_last_count", "last_delta"],
  ["Eye", "eye_count", "target_eye_count", "eye_delta"],
  ["Dental", "dental_count", "target_dental_count", "dental_delta"],
  ["Workday", "workday_count", "target_workday_count", "workday_delta"],
] as const satisfies readonly (readonly [string, keyof LedgerRow, keyof LedgerRow, keyof LedgerRow])[]

function fmt(value: number): string {
  return value.toFixed(2)
}

function signed(value: number): string {
  return value >= 0 ? `+${fmt(value)}` : fmt(value)
}

function providerList(
  providers: readonly { id: string; display_name: string }[],
  providerIds: readonly string[],
): string {
  return providerIds.length === 0 ? "None" : providerIds.map((id) => providerLabel(providers, id)).join(", ")
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  )
}
