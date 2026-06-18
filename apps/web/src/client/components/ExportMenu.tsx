import { type MouseEvent, useState } from "react"
import { exportUrl } from "../api/client"

type ExportKind = "print" | "csv" | "ics"

// Download links for one run. Anchors keep the export URLs inspectable, while click handling fetches
// through the app so structured export errors stay visible in the review UI.
export function ExportMenu({
  runId,
  providers,
}: {
  runId: string
  providers: readonly { id: string; display_name: string }[]
}) {
  const [providerId, setProviderId] = useState("")
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const handleExport =
    (kind: ExportKind, selectedProviderId?: string) => async (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      setMessage(null)
      const url = exportUrl(runId, kind, selectedProviderId)
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ errors: ["Export failed."] }))
        const errors = Array.isArray((body as { errors?: unknown }).errors)
          ? (body as { errors: string[] }).errors
          : ["Export failed."]
        setMessage({ kind: "error", text: errors.join("; ") })
        return
      }
      const blobUrl = URL.createObjectURL(await res.blob())
      if (kind === "print") window.open(blobUrl, "_blank", "noopener,noreferrer")
      else {
        const a = document.createElement("a")
        a.href = blobUrl
        a.download = filename(runId, kind, selectedProviderId)
        a.click()
      }
      setMessage({ kind: "ok", text: "Export ready." })
    }
  return (
    <>
      <div className="toolbar">
        <a href={exportUrl(runId, "print")} target="_blank" rel="noreferrer" onClick={handleExport("print")}>
          Printable HTML
        </a>
        <a href={exportUrl(runId, "csv")} onClick={handleExport("csv")}>
          CSV
        </a>
        <a href={exportUrl(runId, "ics")} onClick={handleExport("ics")}>
          All-provider ICS
        </a>
        <select
          aria-label="Provider-specific ICS provider"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
        >
          <option value="">Select provider…</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
        {providerId === "" ? (
          <button type="button" disabled>
            Provider ICS
          </button>
        ) : (
          <a href={exportUrl(runId, "ics", providerId)} onClick={handleExport("ics", providerId)}>
            Provider ICS
          </a>
        )}
      </div>
      {message !== null ? <p className={message.kind === "ok" ? "ok" : "error"}>{message.text}</p> : null}
    </>
  )
}

function filename(runId: string, kind: ExportKind, providerId: string | undefined): string {
  if (kind === "csv") return `schedule-${runId}.csv`
  if (kind === "ics" && providerId !== undefined) return `schedule-${runId}-${providerId}.ics`
  if (kind === "ics") return `schedule-${runId}.ics`
  return `schedule-${runId}.html`
}
