import type { IsoDate, ProviderId, RunId } from "../domain/ids"
import type { ScheduleScenario } from "../domain/scenario"
import type { ScheduleResult } from "../domain/schedule"
import { calendarEvents } from "./calendarEvents"

// Deterministic VCALENDAR of a schedule. Output is byte-identical for the same run snapshot: events
// come from calendarEvents in result order, DTSTAMP is derived from createdAt (never the wall clock),
// and there is no other time source.
const utf8 = new TextEncoder()

// RFC 5545 TEXT escaping: backslash, semicolon, comma are backslash-escaped; newlines become \n.
function icsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r\n|\r|\n/g, "\\n")
}

// RFC 5545 content lines are folded to 75 octets. Continuation lines begin with one space, which
// counts toward that continuation line's 75-octet limit.
function foldContentLine(line: string): string {
  const folded: string[] = []
  let current = ""
  let currentOctets = 0
  let limit = 75

  for (const char of line) {
    const charOctets = utf8.encode(char).byteLength
    if (currentOctets + charOctets > limit) {
      folded.push(current)
      current = " "
      currentOctets = 1
      limit = 75
    }
    current += char
    currentOctets += charOctets
  }

  folded.push(current)
  return folded.join("\r\n")
}

// "2026-03-02" -> "20260302" for DATE-valued all-day properties.
function icsDate(date: IsoDate): string {
  return date.replaceAll("-", "")
}

// "2026-03-02" -> "20260303" (the all-day DTEND is the day after DTSTART).
function nextIcsDate(date: IsoDate): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replaceAll("-", "")
}

// ISO instant -> "YYYYMMDDTHHMMSSZ". createdAt is the only time source, so this is deterministic.
function icsStamp(createdAt: string): string {
  return new Date(createdAt)
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
}

function eventUrl(runId: RunId, uid: string): string {
  return `qgenda://schedule-runs/${encodeURIComponent(runId)}/assignments/${encodeURIComponent(uid)}`
}

export function scheduleIcs(input: {
  result: ScheduleResult
  scenario: ScheduleScenario
  runId: RunId
  createdAt: string
  providerId?: ProviderId
}): string {
  const { result, scenario, runId, createdAt, providerId } = input
  const stamp = icsStamp(createdAt)
  const events = calendarEvents(result, scenario, runId).filter(
    (e) => providerId === undefined || e.provider_id === providerId,
  )
  const providerName = new Map(scenario.providers.map((p) => [p.id, p.display_name]))
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//qgenda//v0.2//EN", "CALSCALE:GREGORIAN"]
  for (const e of events) {
    const name = providerName.get(e.provider_id) ?? e.provider_id
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `DTEND;VALUE=DATE:${nextIcsDate(e.date)}`,
      `SUMMARY:${icsText(e.title)}`,
      `DESCRIPTION:${icsText(`Provider: ${name}\nSlot: ${e.slot_type}\nDate: ${e.date}`)}`,
      `URL:${eventUrl(runId, e.uid)}`,
      "END:VEVENT",
    )
  }
  lines.push("END:VCALENDAR")
  return `${lines.map(foldContentLine).join("\r\n")}\r\n`
}
