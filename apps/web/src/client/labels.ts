import type { ScheduleStatus } from "@qgenda/core/domain/schedule"

// Single owner of the UI's display labels, so screens never spell statuses or provider names themselves.
const STATUS_LABELS: Record<ScheduleStatus, string> = {
  optimal: "Optimal",
  feasible: "Feasible",
  infeasible: "Infeasible",
  invalid_input: "Invalid input",
  solver_error: "Solver error",
}

export const runStatusLabel = (status: ScheduleStatus): string => STATUS_LABELS[status]

export const providerLabel = (
  providers: readonly { id: string; display_name: string }[],
  id: string,
): string => {
  const provider = providers.find((p) => p.id === id)
  // justify-defect: run detail providers come from the same compiled scenario snapshot as assignments.
  if (provider === undefined) throw new Error(`snapshot invariant: missing provider ${id}`)
  return provider.display_name
}
