import { addIsoDays } from "@qgenda/core/domain/calendar"
import type { IsoDate } from "@qgenda/core/domain/ids"
import type { EditableHoliday, EditableWeekendBlock } from "../api/schemas"
import { nextStableId } from "../draftIds"
import { usePlanning } from "../state"

// Calendar facts screen: holidays and weekend blocks. Each section edits its planning slice immutably and
// persists the whole state through update(); no date classification lives here.
export function CalendarFactsRoute() {
  const { planning, update } = usePlanning()
  if (planning === null) return <p className="muted">Loading…</p>

  const blockOptions = planning.weekend_blocks.map((b) => ({
    value: b.weekend_block_id,
    label: b.label || b.weekend_block_id,
  }))
  const defaultDate = planning.workspace.active_cycle_start

  const setHoliday = (index: number, patch: Partial<EditableHoliday>) =>
    update({
      ...planning,
      holidays: planning.holidays.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    })
  const addHoliday = () => {
    const holiday_id = nextStableId(
      planning.holidays.map((h) => h.holiday_id),
      "holiday",
    )
    update({
      ...planning,
      holidays: [
        ...planning.holidays,
        { holiday_id, date: defaultDate, label: "", class: "minor", weekend_block_id: null },
      ],
    })
  }
  const removeHoliday = (index: number) =>
    update({ ...planning, holidays: planning.holidays.filter((_, i) => i !== index) })

  const setBlock = (index: number, patch: Partial<EditableWeekendBlock>) =>
    update({
      ...planning,
      weekend_blocks: planning.weekend_blocks.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    })
  const addBlock = () => {
    const weekend_block_id = nextStableId(
      planning.weekend_blocks.map((b) => b.weekend_block_id),
      "weekend_block",
    )
    update({
      ...planning,
      weekend_blocks: [
        ...planning.weekend_blocks,
        {
          weekend_block_id,
          label: "",
          dates: [defaultDate],
          split_required: false,
          required_distinct_call_providers: 1,
        },
      ],
    })
  }
  const removeBlock = (index: number) =>
    update({ ...planning, weekend_blocks: planning.weekend_blocks.filter((_, i) => i !== index) })
  const editableDates = (dates: readonly string[]): EditableWeekendBlock["dates"] => {
    const next = dates.length === 0 ? [defaultDate] : [...dates]
    // justify-type-assertion: the wire `dates` encodes a non-empty tuple; the editor preserves at least
    // one row and the server remains the validation authority for semantic ISO dates.
    return next as unknown as EditableWeekendBlock["dates"]
  }
  const nextDate = (date: string) => addIsoDays(date as IsoDate, 1)
  const setBlockDate = (blockIndex: number, dateIndex: number, date: string) => {
    const row = planning.weekend_blocks[blockIndex]
    if (row === undefined) return
    setBlock(blockIndex, { dates: editableDates(row.dates.map((d, i) => (i === dateIndex ? date : d))) })
  }
  const addBlockDate = (blockIndex: number) => {
    const row = planning.weekend_blocks[blockIndex]
    if (row === undefined) return
    setBlock(blockIndex, { dates: editableDates([...row.dates, nextDate(row.dates.at(-1) ?? "")]) })
  }
  const removeBlockDate = (blockIndex: number, dateIndex: number) => {
    const row = planning.weekend_blocks[blockIndex]
    if (row === undefined || row.dates.length <= 1) return
    setBlock(blockIndex, { dates: editableDates(row.dates.filter((_, i) => i !== dateIndex)) })
  }

  return (
    <>
      <section className="panel">
        <h2>Holidays</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Label</th>
              <th>Class</th>
              <th>Weekend block</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {planning.holidays.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are freely edited and have no stable id
              <tr key={index}>
                <td>
                  <input
                    aria-label={`Holiday ${index + 1} ID`}
                    value={row.holiday_id}
                    onChange={(e) => setHoliday(index, { holiday_id: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Holiday ${index + 1} date`}
                    type="date"
                    value={row.date}
                    onChange={(e) => setHoliday(index, { date: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Holiday ${index + 1} label`}
                    value={row.label}
                    onChange={(e) => setHoliday(index, { label: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    aria-label={`Holiday ${index + 1} class`}
                    value={row.class}
                    onChange={(e) => setHoliday(index, { class: e.target.value as EditableHoliday["class"] })}
                  >
                    <option value="major">major</option>
                    <option value="minor">minor</option>
                  </select>
                </td>
                <td>
                  <select
                    aria-label={`Holiday ${index + 1} weekend block`}
                    value={row.weekend_block_id ?? ""}
                    onChange={(e) => setHoliday(index, { weekend_block_id: e.target.value || null })}
                  >
                    <option value="" />
                    {blockOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="row-actions">
                  <button type="button" className="danger" onClick={() => removeHoliday(index)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar">
          <button type="button" className="ghost" onClick={addHoliday}>
            Add holiday
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Weekend blocks</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Label</th>
              <th>Dates</th>
              <th>Split required</th>
              <th>Distinct call providers</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {planning.weekend_blocks.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are freely edited and have no stable id
              <tr key={index}>
                <td>
                  <input
                    aria-label={`Weekend block ${index + 1} ID`}
                    value={row.weekend_block_id}
                    onChange={(e) => setBlock(index, { weekend_block_id: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Weekend block ${index + 1} label`}
                    value={row.label}
                    onChange={(e) => setBlock(index, { label: e.target.value })}
                  />
                </td>
                <td>
                  <div className="date-list">
                    {row.dates.map((date, dateIndex) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: weekend dates are directly editable
                      <div className="date-row" key={dateIndex}>
                        <input
                          aria-label={`Weekend block ${index + 1} date ${dateIndex + 1}`}
                          type="date"
                          value={date}
                          onChange={(e) => setBlockDate(index, dateIndex, e.target.value)}
                        />
                        <button
                          type="button"
                          className="danger compact"
                          onClick={() => removeBlockDate(index, dateIndex)}
                          disabled={row.dates.length <= 1}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="ghost compact"
                      onClick={() => addBlockDate(index)}
                      aria-label={`Add date to weekend block ${index + 1}`}
                    >
                      Add date
                    </button>
                  </div>
                </td>
                <td>
                  <input
                    aria-label={`Weekend block ${index + 1} split required`}
                    type="checkbox"
                    checked={row.split_required}
                    onChange={(e) => setBlock(index, { split_required: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Weekend block ${index + 1} distinct call providers`}
                    type="number"
                    min="1"
                    value={row.required_distinct_call_providers}
                    onChange={(e) =>
                      setBlock(index, { required_distinct_call_providers: Number(e.target.value) })
                    }
                  />
                </td>
                <td className="row-actions">
                  <button type="button" className="danger" onClick={() => removeBlock(index)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar">
          <button type="button" className="ghost" onClick={addBlock}>
            Add weekend block
          </button>
        </div>
      </section>
    </>
  )
}
