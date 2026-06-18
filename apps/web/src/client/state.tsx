import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react"
import { getPlanning, putPlanning } from "./api/client"
import type { EditablePlanning } from "./api/schemas"

// One in-memory copy of the editable planning state, shared by every editing screen and saved as a whole
// (matching the whole-state PUT API). `planning` is null only while the initial load is in flight.
type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; errors: string[] }
type LoadState = { kind: "loading" } | { kind: "ready" } | { kind: "error"; errors: readonly string[] }

type PlanningContextValue = {
  planning: EditablePlanning | null
  loadState: LoadState
  update: (next: EditablePlanning) => void
  save: () => Promise<void>
  saveState: SaveState
}

const PlanningContext = createContext<PlanningContextValue | null>(null)

export function PlanningProvider({ children }: { children: ReactNode }) {
  const [planning, setPlanning] = useState<EditablePlanning | null>(null)
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" })
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" })
  const draftVersion = useRef(0)
  const saveAttempt = useRef(0)

  useEffect(() => {
    getPlanning().then((outcome) => {
      if (outcome.ok) {
        setPlanning(outcome.planning)
        setLoadState({ kind: "ready" })
      } else {
        setLoadState({ kind: "error", errors: outcome.errors })
      }
    })
  }, [])

  const update = (next: EditablePlanning) => {
    draftVersion.current += 1
    setPlanning(next)
    setSaveState({ kind: "dirty" })
  }
  const save = async () => {
    if (planning === null) return
    const version = draftVersion.current
    const attempt = saveAttempt.current + 1
    saveAttempt.current = attempt
    setSaveState({ kind: "saving" })
    const res = await putPlanning(planning)
    if (attempt !== saveAttempt.current) return
    if (version !== draftVersion.current) {
      setSaveState({ kind: "dirty" })
      return
    }
    setSaveState(res.ok ? { kind: "saved" } : { kind: "error", errors: res.errors })
  }

  return (
    <PlanningContext.Provider value={{ planning, loadState, update, save, saveState }}>
      {children}
    </PlanningContext.Provider>
  )
}

export function usePlanning(): PlanningContextValue {
  const ctx = useContext(PlanningContext)
  if (ctx === null) throw new Error("usePlanning must be used inside a PlanningProvider")
  return ctx
}
