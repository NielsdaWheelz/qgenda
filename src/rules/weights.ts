import type { Weights } from "../domain/scenario"

// Default burden weights. Visible and overridable per-scenario via `weights`. Owner of v0.1 defaults.
export const DEFAULT_WEIGHTS: Weights = {
  weekday_call: 1.0,
  friday_night_call: 1.25,
  weekend_call: 1.5,
  minor_holiday_call: 1.5,
  major_holiday_call: 2.0,
  first_position: 1.0,
  second_position: 1.0,
  middle_position: 1.0,
  last_position: 1.0,
  eye_slot: 1.0,
  dental_slot: 1.0,
}
