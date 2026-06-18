import { eachDate, isDentalSlot, isEyeSlot } from "../domain/calendar"
import type { RunId } from "../domain/ids"
import type { ScheduleScenario } from "../domain/scenario"
import type { Assignment, ScheduleResult } from "../domain/schedule"

// Self-contained printable schedule: a single <!doctype html> document with inline, print-friendly CSS
// and no external assets. Not byte-deterministic by contract, but pure and crash-free on empty input.
// All dynamic text is HTML-escaped at the boundary.
function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

// Indicators and an eye/dental label for one assignment, shown after the provider name in the grid.
function assignmentTags(a: Assignment): string {
  const tags: string[] = []
  if (a.derived_call) tags.push("call")
  if (a.weekend) tags.push("weekend")
  if (a.holiday_id !== null) tags.push("holiday")
  if (isEyeSlot(a.slot_type)) tags.push("eye")
  if (isDentalSlot(a.slot_type)) tags.push("dental")
  return tags.map((t) => `<span class="tag ${t}">${t}</span>`).join("")
}

const STYLE = `
  body { font: 14px system-ui, sans-serif; margin: 1.5rem; color: #111 }
  h1 { font-size: 1.3rem; margin: 0 0 .25rem }
  .meta { color: #555; margin-bottom: 1rem }
  .day { border-top: 1px solid #ddd; padding: .4rem 0; page-break-inside: avoid }
  .date { font-weight: 600 }
  .empty { color: #999 }
  ul { margin: .2rem 0; padding-left: 1.2rem }
  .tag { font-size: .72rem; padding: 0 .3rem; margin-left: .3rem; border-radius: .25rem; background: #eee }
  .tag.call { background: #fde0e0 } .tag.weekend { background: #e0e7fd }
  .tag.holiday { background: #fce9c8 } .tag.eye { background: #e0f5e6 } .tag.dental { background: #ece0f5 }
  .legend span, .fairness span { display: inline-block; margin-right: 1rem }
  table { border-collapse: collapse; margin-top: .3rem }
  td, th { border: 1px solid #ddd; padding: .15rem .5rem; text-align: right } th { text-align: left }
`

export function printableScheduleHtml(input: {
  result: ScheduleResult
  scenario: ScheduleScenario
  runId: RunId
  createdAt: string
}): string {
  const { result, scenario, createdAt } = input
  const { start_date, end_date } = scenario.horizon
  const nameOf = new Map(scenario.providers.map((p) => [p.id, p.display_name]))
  const providerName = (providerId: Assignment["provider_id"]): string => {
    const name = nameOf.get(providerId)
    if (name === undefined)
      throw new Error(`export invariant: assignment references unknown provider ${providerId}`)
    return name
  }
  const byDate = new Map<string, Assignment[]>()
  for (const a of result.assignments) {
    const list = byDate.get(a.date)
    if (list === undefined) byDate.set(a.date, [a])
    else list.push(a)
  }

  const days = eachDate(start_date, end_date)
    .map((date) => {
      const rows = (byDate.get(date) ?? []).map((a) => {
        const name = providerName(a.provider_id)
        return `<li>${esc(name)}${assignmentTags(a)}</li>`
      })
      const body = rows.length > 0 ? `<ul>${rows.join("")}</ul>` : `<div class="empty">—</div>`
      return `<div class="day"><div class="date">${esc(date)}</div>${body}</div>`
    })
    .join("")

  const legend = scenario.providers.map((p) => `<span>${esc(p.display_name)}</span>`).join("")

  const fairness = result.scorecard.providers
    .map((r) => {
      const name = nameOf.get(r.provider_id)
      if (name === undefined)
        throw new Error(`export invariant: scorecard references unknown provider ${r.provider_id}`)
      return (
        `<tr><td>${esc(name)}</td>` +
        `<td>${r.call_burden.toFixed(2)}</td><td>${r.call_delta.toFixed(2)}</td></tr>`
      )
    })
    .join("")
  const fairnessTable =
    fairness === ""
      ? `<p class="empty">No fairness data.</p>`
      : `<table><tr><th>provider</th><th>call burden</th><th>call Δ</th></tr>${fairness}</table>` +
        `<p class="fairness"><span>largest +Δ: ${result.scorecard.largest_positive_delta.toFixed(2)}</span>` +
        `<span>largest −Δ: ${result.scorecard.largest_negative_delta.toFixed(2)}</span></p>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Schedule ${esc(start_date)}..${esc(end_date)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>Schedule ${esc(start_date)}..${esc(end_date)}</h1>
<div class="meta">Generated ${esc(createdAt)} · status: ${esc(result.status)}</div>
<div class="legend"><strong>Providers:</strong> ${legend}</div>
<h2>Days</h2>
${days}
<h2>Fairness</h2>
${fairnessTable}
</body>
</html>
`
}
