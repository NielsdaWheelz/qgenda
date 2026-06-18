import { GenerationRequest, PlanningState } from "@qgenda/core/planning/planningSchema"
import { Schema } from "effect"

// One shared, schema-valid planning fixture reused by the core, storage, and web test tiers. It is a
// small but solver-feasible month: four call-eligible providers plus one eye+dental provider, weekday
// call with one list slot (eye on Wednesdays, dental on Thursdays), weekends closed. Because demand is
// keyed by weekday and all seven weekdays are covered, any horizon compiles to complete demand.

const weekdayCall = (weekday: string, eye_slots = 0, dental_slots = 0) => ({
  template_id: `tpl_${weekday}`,
  weekday,
  room_count: 4,
  normal_list_slots: 1,
  eye_slots,
  dental_slots,
  call_required: true,
  active_from: "2026-01-01",
  active_until: null,
})

const closed = (weekday: string) => ({
  template_id: `tpl_${weekday}`,
  weekday,
  room_count: 0,
  normal_list_slots: 0,
  eye_slots: 0,
  dental_slots: 0,
  call_required: false,
  active_from: "2026-01-01",
  active_until: null,
})

const provider = (provider_id: string, flags: { call: boolean; eye?: boolean; dental?: boolean }) => ({
  provider_id,
  display_name: provider_id,
  fte: 1,
  call_eligible: flags.call,
  eye_eligible: flags.eye ?? false,
  dental_eligible: flags.dental ?? false,
  active_from: "2026-01-01",
  active_until: null,
})

export const samplePlanningJson = {
  workspace: {
    schema_version: "v0.2",
    workspace_id: "local",
    timezone: "America/Los_Angeles",
    active_cycle_start: "2026-01-01",
    active_cycle_end: "2026-12-31",
    opening_ledger_start_fresh: true,
  },
  providers: [
    provider("dr_a", { call: true }),
    provider("dr_b", { call: true }),
    provider("dr_c", { call: true }),
    provider("dr_d", { call: true }),
    provider("dr_sub", { call: false, eye: true, dental: true }),
  ],
  unavailability: [],
  demand_templates: [
    weekdayCall("monday"),
    weekdayCall("tuesday"),
    weekdayCall("wednesday", 1, 0),
    weekdayCall("thursday", 0, 1),
    weekdayCall("friday"),
    closed("saturday"),
    closed("sunday"),
  ],
  date_exceptions: [],
  holidays: [],
  weekend_blocks: [],
  opening_ledger: [],
}

export const sampleGenerationJson = {
  horizon: { start_date: "2026-03-02", end_date: "2026-03-08" },
  solver: { max_seconds: 30, random_seed: 1, allow_feasible_result: false },
}

export const samplePlanning = (): PlanningState =>
  Schema.decodeUnknownSync(PlanningState)(samplePlanningJson, { onExcessProperty: "error" })

export const sampleGeneration = (): GenerationRequest =>
  Schema.decodeUnknownSync(GenerationRequest)(sampleGenerationJson, { onExcessProperty: "error" })
