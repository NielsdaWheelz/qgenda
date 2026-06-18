import { useRoute } from "./router"
import { CalendarFactsRoute } from "./routes/CalendarFactsRoute"
import { DashboardRoute } from "./routes/DashboardRoute"
import { DemandRoute } from "./routes/DemandRoute"
import { GenerateRoute } from "./routes/GenerateRoute"
import { RosterRoute } from "./routes/RosterRoute"
import { RunReviewRoute } from "./routes/RunReviewRoute"
import { PlanningProvider, usePlanning } from "./state"

// App shell: persistent nav + a global Save bar over the routed screen. Operational software, not a
// marketing site. The engine, compiler, and storage own all behavior; screens are thin editors/viewers.
const NAV = [
  ["/", "Dashboard"],
  ["/roster", "Roster"],
  ["/demand", "Demand"],
  ["/calendar-facts", "Calendar Facts"],
  ["/generate", "Generate"],
  ["/runs", "Runs"],
] as const

export function App() {
  return (
    <PlanningProvider>
      <Shell />
    </PlanningProvider>
  )
}

function Shell() {
  const { path } = useRoute()
  const { loadState } = usePlanning()
  const active = (to: string) => (to === "/" ? path === "/" : path.startsWith(to))
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">qgenda</span>
        <nav>
          {NAV.map(([to, label]) => (
            <a
              key={to}
              href={`#${to}`}
              className={active(to) ? "active" : ""}
              aria-current={active(to) ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <SaveBar />
      </header>
      <main>
        {loadState.kind === "error" ? (
          <div className="panel">
            <h1>Planning unavailable</h1>
            <ul className="error">
              {loadState.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : (
          renderRoute(path)
        )}
      </main>
    </div>
  )
}

function renderRoute(path: string) {
  if (path.startsWith("/roster")) return <RosterRoute />
  if (path.startsWith("/demand")) return <DemandRoute />
  if (path.startsWith("/calendar-facts")) return <CalendarFactsRoute />
  if (path.startsWith("/generate")) return <GenerateRoute />
  if (path.startsWith("/runs/")) return <RunReviewRoute runId={path.slice("/runs/".length)} />
  if (path.startsWith("/runs")) return <RunReviewRoute runId={null} />
  return <DashboardRoute />
}

function SaveBar() {
  const { loadState, planning, save, saveState } = usePlanning()
  return (
    <div className="savebar" role="status" aria-live="polite">
      {loadState.kind === "error" && <span className="error">{loadState.errors.join("; ")}</span>}
      {saveState.kind === "dirty" && <span className="muted">Unsaved changes</span>}
      {saveState.kind === "error" && <span className="error">{saveState.errors.join("; ")}</span>}
      {saveState.kind === "saved" && <span className="ok">Saved</span>}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saveState.kind === "saving" || loadState.kind !== "ready" || planning === null}
      >
        {saveState.kind === "saving" ? "Saving…" : "Save planning"}
      </button>
    </div>
  )
}
