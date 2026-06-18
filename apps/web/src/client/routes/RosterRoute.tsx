import type { EditableOpeningLedger, EditableUnavailability } from "../api/schemas"
import { ProviderForm } from "../components/ProviderForm"
import { nextStableId } from "../draftIds"
import { usePlanning } from "../state"

const KINDS = ["vacation", "conference", "leave", "other"] as const

// Roster screen: providers, their unavailability, and the opening fairness ledger. Each section edits its
// planning slice immutably and persists the whole state through update(); no scheduling logic lives here.
export function RosterRoute() {
  const { planning, update } = usePlanning()
  if (planning === null) return <p className="muted">Loading…</p>

  const providerOptions = planning.providers.map((p) => ({
    value: p.provider_id,
    label: p.display_name || p.provider_id,
  }))

  const setUnavailability = (index: number, patch: Partial<EditableUnavailability>) =>
    update({
      ...planning,
      unavailability: planning.unavailability.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    })
  const addUnavailability = () => {
    const provider = providerOptions[0]?.value
    if (provider === undefined) return
    const unavailability_id = nextStableId(
      planning.unavailability.map((u) => u.unavailability_id),
      "unavailability",
    )
    update({
      ...planning,
      unavailability: [
        ...planning.unavailability,
        {
          unavailability_id,
          provider_id: provider,
          start_date: planning.workspace.active_cycle_start,
          end_date: planning.workspace.active_cycle_start,
          kind: "vacation",
          label: "",
        },
      ],
    })
  }
  const removeUnavailability = (index: number) =>
    update({ ...planning, unavailability: planning.unavailability.filter((_, i) => i !== index) })

  const cycleStart = planning.workspace.active_cycle_start
  const setLedger = (index: number, patch: Partial<EditableOpeningLedger>) =>
    update({
      ...planning,
      opening_ledger: planning.opening_ledger.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    })
  const addLedger = () => {
    const provider = providerOptions[0]?.value
    if (provider === undefined) return
    update({
      ...planning,
      opening_ledger: [
        ...planning.opening_ledger,
        {
          provider_id: provider,
          cycle_start: cycleStart,
          as_of_date: cycleStart,
          call_burden: 0,
          weekend_burden: 0,
          holiday_burden: 0,
          first_count: 0,
          second_count: 0,
          middle_count: 0,
          last_count: 0,
          eye_count: 0,
          dental_count: 0,
        },
      ],
    })
  }
  const removeLedger = (index: number) =>
    update({ ...planning, opening_ledger: planning.opening_ledger.filter((_, i) => i !== index) })

  return (
    <>
      <section className="panel">
        <h2>Providers</h2>
        <ProviderForm
          providers={planning.providers}
          defaultActiveFrom={planning.workspace.active_cycle_start}
          onChange={(providers) => update({ ...planning, providers })}
        />
      </section>

      <section className="panel">
        <h2>Unavailability</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Provider</th>
              <th>Start</th>
              <th>End</th>
              <th>Kind</th>
              <th>Label</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {planning.unavailability.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are freely edited and have no stable id
              <tr key={index}>
                <td>
                  <input
                    aria-label={`Unavailability ${index + 1} ID`}
                    value={row.unavailability_id}
                    onChange={(e) => setUnavailability(index, { unavailability_id: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    aria-label={`Unavailability ${index + 1} provider`}
                    value={row.provider_id}
                    onChange={(e) => setUnavailability(index, { provider_id: e.target.value })}
                  >
                    <option value="" />
                    {providerOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`Unavailability ${index + 1} start date`}
                    type="date"
                    value={row.start_date}
                    onChange={(e) => setUnavailability(index, { start_date: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Unavailability ${index + 1} end date`}
                    type="date"
                    value={row.end_date}
                    onChange={(e) => setUnavailability(index, { end_date: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    aria-label={`Unavailability ${index + 1} kind`}
                    value={row.kind}
                    onChange={(e) =>
                      setUnavailability(index, { kind: e.target.value as EditableUnavailability["kind"] })
                    }
                  >
                    {KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`Unavailability ${index + 1} label`}
                    value={row.label}
                    onChange={(e) => setUnavailability(index, { label: e.target.value })}
                  />
                </td>
                <td className="row-actions">
                  <button type="button" className="danger" onClick={() => removeUnavailability(index)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar">
          <button
            type="button"
            className="ghost"
            onClick={addUnavailability}
            disabled={providerOptions.length === 0}
          >
            Add unavailability
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Opening fairness ledger</h2>
        <label className="inline">
          <input
            type="checkbox"
            checked={planning.workspace.opening_ledger_start_fresh}
            onChange={(e) =>
              update({
                ...planning,
                workspace: {
                  ...planning.workspace,
                  opening_ledger_start_fresh: e.target.checked,
                },
              })
            }
          />
          Start this cycle with zero opening debt for missing ledger rows
        </label>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Cycle start</th>
              <th>As of</th>
              <th>Call</th>
              <th>Weekend</th>
              <th>Holiday</th>
              <th>First</th>
              <th>Second</th>
              <th>Middle</th>
              <th>Last</th>
              <th>Eye</th>
              <th>Dental</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {planning.opening_ledger.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are freely edited and have no stable id
              <tr key={index}>
                <td>
                  <select
                    aria-label={`Ledger ${index + 1} provider`}
                    value={row.provider_id}
                    onChange={(e) => setLedger(index, { provider_id: e.target.value })}
                  >
                    <option value="" />
                    {providerOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`Ledger ${index + 1} cycle start`}
                    type="date"
                    value={row.cycle_start}
                    onChange={(e) => setLedger(index, { cycle_start: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Ledger ${index + 1} as of date`}
                    type="date"
                    value={row.as_of_date}
                    onChange={(e) => setLedger(index, { as_of_date: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Ledger ${index + 1} call burden`}
                    type="number"
                    step="0.5"
                    value={row.call_burden}
                    onChange={(e) => setLedger(index, { call_burden: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Ledger ${index + 1} weekend burden`}
                    type="number"
                    step="0.5"
                    value={row.weekend_burden}
                    onChange={(e) => setLedger(index, { weekend_burden: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Ledger ${index + 1} holiday burden`}
                    type="number"
                    step="0.5"
                    value={row.holiday_burden}
                    onChange={(e) => setLedger(index, { holiday_burden: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Ledger ${index + 1} first count`}
                    type="number"
                    value={row.first_count}
                    onChange={(e) => setLedger(index, { first_count: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Ledger ${index + 1} second count`}
                    type="number"
                    value={row.second_count}
                    onChange={(e) => setLedger(index, { second_count: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Ledger ${index + 1} middle count`}
                    type="number"
                    value={row.middle_count}
                    onChange={(e) => setLedger(index, { middle_count: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Ledger ${index + 1} last count`}
                    type="number"
                    value={row.last_count}
                    onChange={(e) => setLedger(index, { last_count: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Ledger ${index + 1} eye count`}
                    type="number"
                    value={row.eye_count}
                    onChange={(e) => setLedger(index, { eye_count: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Ledger ${index + 1} dental count`}
                    type="number"
                    value={row.dental_count}
                    onChange={(e) => setLedger(index, { dental_count: Number(e.target.value) })}
                  />
                </td>
                <td className="row-actions">
                  <button type="button" className="danger" onClick={() => removeLedger(index)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar">
          <button type="button" className="ghost" onClick={addLedger} disabled={providerOptions.length === 0}>
            Add ledger entry
          </button>
        </div>
      </section>
    </>
  )
}
