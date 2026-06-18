// Browser-side draft row IDs. These are convenience IDs for newly-added editable rows; the server still
// owns canonical schema validation on save. IDs are stable strings and are never derived from display names.
export function nextStableId(existing: readonly string[], prefix: string): string {
  const used = new Set(existing)
  for (let i = 1; ; i++) {
    const id = `${prefix}_${i}`
    if (!used.has(id)) return id
  }
}
