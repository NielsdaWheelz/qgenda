import type { EditableException } from "../api/schemas"
import { nextStableId } from "../draftIds"

// Pure editor over per-date demand overrides. No date classification here; the server validates on save.
export function DateExceptionForm({
  exceptions,
  onChange,
  defaultDate,
}: {
  exceptions: readonly EditableException[]
  onChange: (next: EditableException[]) => void
  defaultDate: string
}) {
  const setRow = (index: number, patch: Partial<EditableException>) =>
    onChange(exceptions.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const remove = (index: number) => onChange(exceptions.filter((_, i) => i !== index))
  const add = () => {
    const exception_id = nextStableId(
      exceptions.map((e) => e.exception_id),
      "exception",
    )
    onChange([
      ...exceptions,
      {
        exception_id,
        date: defaultDate,
        room_count: 4,
        normal_list_slots: 1,
        eye_slots: 0,
        dental_slots: 0,
        call_required: false,
        label: "",
      },
    ])
  }

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Exception ID</th>
            <th>Date</th>
            <th>Rooms</th>
            <th>Normal slots</th>
            <th>Eye slots</th>
            <th>Dental slots</th>
            <th>Call</th>
            <th>Label</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {exceptions.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are freely edited and have no stable id
            <tr key={index}>
              <td>
                <input
                  aria-label={`Exception ${index + 1} ID`}
                  value={row.exception_id}
                  onChange={(e) => setRow(index, { exception_id: e.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Exception ${index + 1} date`}
                  type="date"
                  value={row.date}
                  onChange={(e) => setRow(index, { date: e.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Exception ${index + 1} rooms`}
                  type="number"
                  value={row.room_count}
                  onChange={(e) => setRow(index, { room_count: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`Exception ${index + 1} normal slots`}
                  type="number"
                  value={row.normal_list_slots}
                  onChange={(e) => setRow(index, { normal_list_slots: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`Exception ${index + 1} eye slots`}
                  type="number"
                  value={row.eye_slots}
                  onChange={(e) => setRow(index, { eye_slots: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`Exception ${index + 1} dental slots`}
                  type="number"
                  value={row.dental_slots}
                  onChange={(e) => setRow(index, { dental_slots: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  aria-label={`Exception ${index + 1} call required`}
                  type="checkbox"
                  checked={row.call_required}
                  onChange={(e) => setRow(index, { call_required: e.target.checked })}
                />
              </td>
              <td>
                <input
                  aria-label={`Exception ${index + 1} label`}
                  value={row.label}
                  onChange={(e) => setRow(index, { label: e.target.value })}
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
          Add exception
        </button>
      </div>
    </>
  )
}
