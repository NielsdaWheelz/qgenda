import type { EditableProvider } from "../api/schemas"
import { nextStableId } from "../draftIds"

// Pure editor over the provider roster slice: every edit rebuilds the array immutably and hands it to
// onChange. No eligibility/date rules here — the server validates on save.
export function ProviderForm({
  providers,
  onChange,
  defaultActiveFrom,
}: {
  providers: readonly EditableProvider[]
  onChange: (next: EditableProvider[]) => void
  defaultActiveFrom: string
}) {
  const setRow = (index: number, patch: Partial<EditableProvider>) =>
    onChange(providers.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const remove = (index: number) => onChange(providers.filter((_, i) => i !== index))
  const add = () => {
    const provider_id = nextStableId(
      providers.map((p) => p.provider_id),
      "provider",
    )
    onChange([
      ...providers,
      {
        provider_id,
        display_name: `Provider ${providers.length + 1}`,
        fte: 1,
        call_eligible: false,
        eye_eligible: false,
        dental_eligible: false,
        active_from: defaultActiveFrom,
        active_until: null,
      },
    ])
  }

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Provider ID</th>
            <th>Display name</th>
            <th>FTE</th>
            <th>Call</th>
            <th>Eye</th>
            <th>Dental</th>
            <th>Active from</th>
            <th>Active until</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {providers.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are freely edited and have no stable id
            <tr key={index}>
              <td>
                <code>{row.provider_id}</code>
              </td>
              <td>
                <input
                  aria-label={`Provider ${index + 1} display name`}
                  value={row.display_name}
                  onChange={(e) => setRow(index, { display_name: e.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Provider ${index + 1} FTE`}
                  type="number"
                  step="0.1"
                  value={row.fte}
                  onChange={(e) => setRow(index, { fte: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`Provider ${index + 1} call eligible`}
                  type="checkbox"
                  checked={row.call_eligible}
                  onChange={(e) => setRow(index, { call_eligible: e.target.checked })}
                />
              </td>
              <td>
                <input
                  aria-label={`Provider ${index + 1} eye eligible`}
                  type="checkbox"
                  checked={row.eye_eligible}
                  onChange={(e) => setRow(index, { eye_eligible: e.target.checked })}
                />
              </td>
              <td>
                <input
                  aria-label={`Provider ${index + 1} dental eligible`}
                  type="checkbox"
                  checked={row.dental_eligible}
                  onChange={(e) => setRow(index, { dental_eligible: e.target.checked })}
                />
              </td>
              <td>
                <input
                  aria-label={`Provider ${index + 1} active from`}
                  type="date"
                  value={row.active_from}
                  onChange={(e) => setRow(index, { active_from: e.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Provider ${index + 1} active until`}
                  type="date"
                  value={row.active_until ?? ""}
                  onChange={(e) => setRow(index, { active_until: e.target.value || null })}
                />
              </td>
              <td className="row-actions">
                <button type="button" className="danger" onClick={() => remove(index)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="toolbar">
        <button type="button" className="ghost" onClick={add}>
          Add provider
        </button>
      </div>
    </>
  )
}
