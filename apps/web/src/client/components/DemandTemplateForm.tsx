import type { EditableTemplate } from "../api/schemas"
import { nextStableId } from "../draftIds"

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

// Pure editor over the weekly demand templates. It does not recompute demand rules; the server/compiler
// is the validation gate.
export function DemandTemplateForm({
  templates,
  onChange,
  defaultActiveFrom,
}: {
  templates: readonly EditableTemplate[]
  onChange: (next: EditableTemplate[]) => void
  defaultActiveFrom: string
}) {
  const setRow = (index: number, patch: Partial<EditableTemplate>) =>
    onChange(templates.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const remove = (index: number) => onChange(templates.filter((_, i) => i !== index))
  const add = () => {
    const template_id = nextStableId(
      templates.map((t) => t.template_id),
      "template",
    )
    onChange([
      ...templates,
      {
        template_id,
        weekday: "monday",
        room_count: 4,
        normal_list_slots: 1,
        eye_slots: 0,
        dental_slots: 0,
        call_required: false,
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
            <th>Template ID</th>
            <th>Weekday</th>
            <th>Rooms</th>
            <th>Normal slots</th>
            <th>Eye slots</th>
            <th>Dental slots</th>
            <th>Call</th>
            <th>Active from</th>
            <th>Active until</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {templates.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are freely edited and have no stable id
            <tr key={index}>
              <td>
                <input
                  aria-label={`Template ${index + 1} ID`}
                  value={row.template_id}
                  onChange={(e) => setRow(index, { template_id: e.target.value })}
                />
              </td>
              <td>
                <select
                  aria-label={`Template ${index + 1} weekday`}
                  value={row.weekday}
                  onChange={(e) => setRow(index, { weekday: e.target.value as EditableTemplate["weekday"] })}
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  aria-label={`Template ${index + 1} rooms`}
                  type="number"
                  value={row.room_count}
                  onChange={(e) => setRow(index, { room_count: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`Template ${index + 1} normal slots`}
                  type="number"
                  value={row.normal_list_slots}
                  onChange={(e) => setRow(index, { normal_list_slots: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`Template ${index + 1} eye slots`}
                  type="number"
                  value={row.eye_slots}
                  onChange={(e) => setRow(index, { eye_slots: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`Template ${index + 1} dental slots`}
                  type="number"
                  value={row.dental_slots}
                  onChange={(e) => setRow(index, { dental_slots: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`Template ${index + 1} call required`}
                  type="checkbox"
                  checked={row.call_required}
                  onChange={(e) => setRow(index, { call_required: e.target.checked })}
                />
              </td>
              <td>
                <input
                  aria-label={`Template ${index + 1} active from`}
                  type="date"
                  value={row.active_from}
                  onChange={(e) => setRow(index, { active_from: e.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Template ${index + 1} active until`}
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
          Add template
        </button>
      </div>
    </>
  )
}
