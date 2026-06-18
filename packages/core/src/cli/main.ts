#!/usr/bin/env bun
import { generateSchedule } from "../api/generateSchedule"
import type { ScheduleResult } from "../domain/schedule"

// CLI adapter: reads a scenario file, runs the engine, writes the result, prints an optional table, and
// maps status to an exit code. It owns no scheduling rules.

const args = process.argv.slice(2)
const scenarioPath = args.find((a) => !a.startsWith("--"))
if (scenarioPath === undefined) {
  console.error("usage: qgenda-solve SCENARIO_JSON [--out RESULT_JSON] [--table] [--strict] [--pretty]")
  process.exit(2)
}
const outAt = args.indexOf("--out")
const outPath = outAt >= 0 ? args[outAt + 1] : undefined
const table = args.includes("--table")
const strict = args.includes("--strict")
const pretty = args.includes("--pretty")

let request: unknown
try {
  request = await Bun.file(scenarioPath).json()
} catch (e) {
  console.error(
    `FILE_READ_ERROR: cannot read scenario ${scenarioPath}: ${e instanceof Error ? e.message : e}`,
  )
  process.exit(1)
}

const out = await generateSchedule(request)
const json = pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out)
if (outPath !== undefined) await Bun.write(outPath, `${json}\n`)
else console.log(json)
if (table) console.log(renderTable(out))
for (const w of out.warnings) console.error(w)

const ok = strict ? out.status === "optimal" : out.status === "optimal" || out.status === "feasible"
process.exit(ok ? 0 : 1)

function renderTable(r: ScheduleResult): string {
  const lines = [
    `status: ${r.status}  objective: ${r.solver.objective_value ?? "-"}  backend: ${r.solver.backend || "-"}  wall: ${r.solver.wall_time_seconds.toFixed(2)}s`,
    `hard-rule violations: ${r.hard_rule_report.violation_count}`,
  ]
  if (r.assignments.length > 0) {
    lines.push("", "assignments:")
    for (const a of r.assignments) {
      const tags = [a.derived_call ? "call" : "", a.weekend ? "weekend" : "", a.holiday_id ? "holiday" : ""]
        .filter(Boolean)
        .join(",")
      lines.push(`  ${a.date}  ${a.slot_type.padEnd(18)} ${a.provider_id}${tags ? `  [${tags}]` : ""}`)
    }
  }
  if (r.scorecard.providers.length > 0) {
    lines.push(
      "",
      "fairness ledger (provider: workdays call call_burden weekend holiday | first second middle last eye dental | call_delta):",
    )
    for (const p of r.scorecard.providers) {
      lines.push(
        `  ${p.provider_id.padEnd(22)} ${p.workday_count} ${p.call_count} ${p.call_burden.toFixed(2)} ${p.weekend_count} ${p.holiday_count} | ${p.first_count} ${p.second_count} ${p.middle_count} ${p.last_count} ${p.eye_count} ${p.dental_count} | ${p.call_delta.toFixed(2)}`,
      )
    }
  }
  return lines.join("\n")
}
