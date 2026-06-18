import { DateExceptionForm } from "../components/DateExceptionForm"
import { DemandTemplateForm } from "../components/DemandTemplateForm"
import { usePlanning } from "../state"

// Demand screen: weekly templates and per-date exceptions. Both forms edit their planning slice and
// persist the whole state through update(); no demand math lives here.
export function DemandRoute() {
  const { planning, update } = usePlanning()
  if (planning === null) return <p className="muted">Loading…</p>

  return (
    <>
      <section className="panel">
        <h2>Weekly demand templates</h2>
        <DemandTemplateForm
          templates={planning.demand_templates}
          defaultActiveFrom={planning.workspace.active_cycle_start}
          onChange={(demand_templates) => update({ ...planning, demand_templates })}
        />
      </section>

      <section className="panel">
        <h2>Date exceptions</h2>
        <DateExceptionForm
          exceptions={planning.date_exceptions}
          defaultDate={planning.workspace.active_cycle_start}
          onChange={(date_exceptions) => update({ ...planning, date_exceptions })}
        />
      </section>
    </>
  )
}
