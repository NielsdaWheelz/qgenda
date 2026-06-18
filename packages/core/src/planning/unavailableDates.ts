import { eachDate } from "../domain/calendar"
import type { IsoDate, ProviderId } from "../domain/ids"
import type { ProviderUnavailability } from "./planningSchema"

// Expand inclusive unavailability ranges into the engine's per-provider unavailable_dates (spec
// "Provider Unavailability"). Dates outside the horizon never affect a run, so they are dropped; each
// provider's result is sorted and de-duplicated (ISO date strings sort chronologically).
export function expandUnavailableDates(
  unavailability: readonly ProviderUnavailability[],
  horizon: { start_date: IsoDate; end_date: IsoDate },
): Map<ProviderId, IsoDate[]> {
  const horizonSet = new Set<IsoDate>(eachDate(horizon.start_date, horizon.end_date))
  const byProvider = new Map<ProviderId, Set<IsoDate>>()
  for (const u of unavailability) {
    const dates = byProvider.get(u.provider_id) ?? new Set<IsoDate>()
    for (const date of eachDate(u.start_date, u.end_date)) if (horizonSet.has(date)) dates.add(date)
    byProvider.set(u.provider_id, dates)
  }
  const result = new Map<ProviderId, IsoDate[]>()
  for (const [id, dates] of byProvider) result.set(id, [...dates].sort())
  return result
}
