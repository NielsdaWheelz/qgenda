import { useState } from "react"
import { type CompileOutcome, compile, type GenerateOutcome, generate } from "../api/client"
import { runStatusLabel } from "../labels"
import { useRoute } from "../router"
import { usePlanning } from "../state"

// Compile-preview + generate screen. Compile is advisory; generation is blocked while the last compile
// reports errors or a request is in flight. Navigates to the new run on success.
export function GenerateRoute() {
  const { navigate } = useRoute()
  const { saveState } = usePlanning()
  const [horizon, setHorizon] = useState({ start_date: "2026-03-01", end_date: "2026-03-31" })
  const [solver, setSolver] = useState({ max_seconds: 30, random_seed: 1, allow_feasible_result: false })
  const [preview, setPreview] = useState<CompileOutcome | null>(null)
  const [compiledHorizonKey, setCompiledHorizonKey] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<GenerateOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const horizonKey = `${horizon.start_date}:${horizon.end_date}`
  const compileIsFresh = preview?.ok === true && compiledHorizonKey === horizonKey
  const planningIsSaved = saveState.kind === "idle" || saveState.kind === "saved"

  const setStart = (start_date: string) => {
    setHorizon({ ...horizon, start_date })
    setPreview(null)
    setCompiledHorizonKey(null)
  }
  const setEnd = (end_date: string) => {
    setHorizon({ ...horizon, end_date })
    setPreview(null)
    setCompiledHorizonKey(null)
  }

  const runCompile = async () => {
    if (!planningIsSaved) return
    setBusy(true)
    setPreview(await compile(horizon))
    setCompiledHorizonKey(horizonKey)
    setBusy(false)
  }
  const runGenerate = async () => {
    if (!planningIsSaved) return
    setBusy(true)
    const result = await generate({ horizon, solver })
    setBusy(false)
    if (result.kind === "created") navigate(`/runs/${result.run.run_id}`)
    else setOutcome(result)
  }

  return (
    <div>
      <h1>Generate</h1>
      <div className="panel">
        <div className="toolbar">
          <label>
            Start
            <input type="date" value={horizon.start_date} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            End
            <input type="date" value={horizon.end_date} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <div className="toolbar">
          <label>
            Max seconds
            <input
              type="number"
              value={solver.max_seconds}
              onChange={(e) => setSolver({ ...solver, max_seconds: Number(e.target.value) })}
            />
          </label>
          <label>
            Random seed
            <input
              type="number"
              value={solver.random_seed}
              onChange={(e) => setSolver({ ...solver, random_seed: Number(e.target.value) })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={solver.allow_feasible_result}
              onChange={(e) => setSolver({ ...solver, allow_feasible_result: e.target.checked })}
            />
            Allow feasible result
          </label>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="ghost"
            onClick={() => void runCompile()}
            disabled={busy || !planningIsSaved}
          >
            Compile preview
          </button>
          <button
            type="button"
            onClick={() => void runGenerate()}
            disabled={busy || !planningIsSaved || !compileIsFresh}
          >
            Generate schedule
          </button>
        </div>
      </div>

      {!planningIsSaved && (
        <div className="panel">
          <p className="error">
            Save planning before compiling or generating; generation uses the persisted snapshot.
          </p>
        </div>
      )}

      {preview !== null &&
        (preview.ok ? (
          <div className="panel">
            <p className="ok">
              Compiled: {preview.summary.counts.days} days, {preview.summary.counts.providers} providers,{" "}
              {preview.summary.counts.holidays} holidays, {preview.summary.counts.weekend_blocks} weekend
              blocks
            </p>
            {preview.summary.diagnostics.length > 0 && (
              <ul className="diagnostics">
                {preview.summary.diagnostics.map((d) => (
                  <li key={`${d.code}:${d.path.join(".")}`} className={d.severity}>
                    {d.code}: {d.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="panel">
            <ul className="diagnostics">
              {preview.diagnostics.map((d) => (
                <li key={`${d.code}:${d.path.join(".")}`} className={d.severity}>
                  {d.code}: {d.message}
                </li>
              ))}
            </ul>
            {preview.messages.map((m) => (
              <p key={m} className="error">
                {m}
              </p>
            ))}
          </div>
        ))}

      {outcome !== null && outcome.kind === "engine" && (
        <div className="panel">
          <p>
            {runStatusLabel(outcome.run.status)} — <a href={`#/runs/${outcome.run.run_id}`}>open run</a>
          </p>
        </div>
      )}
      {outcome !== null && outcome.kind === "invalid" && (
        <div className="panel">
          <ul className="diagnostics">
            {outcome.diagnostics.map((d) => (
              <li key={`${d.code}:${d.path.join(".")}`} className={d.severity}>
                {d.code}: {d.message}
              </li>
            ))}
          </ul>
          {outcome.messages.map((m) => (
            <p key={m} className="error">
              {m}
            </p>
          ))}
        </div>
      )}
      {outcome !== null && outcome.kind === "unexpected" && (
        <div className="panel">
          {outcome.errors.map((m) => (
            <p key={m} className="error">
              {m}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
