import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

// SQLite storage shape for the local planning workspace and immutable run snapshots (spec
// "Persistence"). Columns mirror the planning schema in @qgenda/core/planning/planningSchema; the
// repositories own the row <-> domain conversion and decode JSON columns at the boundary. Same-database
// foreign keys record hard reachability (a dangling reference is rejected at write time); there are no
// CHECK constraints, triggers, or cascades — richer invariants live in application code.

export const workspace = sqliteTable("workspace", {
  workspace_id: text("workspace_id").primaryKey(),
  schema_version: text("schema_version").notNull(),
  timezone: text("timezone").notNull(),
  active_cycle_start: text("active_cycle_start").notNull(),
  active_cycle_end: text("active_cycle_end").notNull(),
  opening_ledger_start_fresh: integer("opening_ledger_start_fresh", { mode: "boolean" }).notNull(),
})

export const provider = sqliteTable("provider", {
  provider_id: text("provider_id").primaryKey(),
  display_name: text("display_name").notNull(),
  fte: real("fte").notNull(),
  call_eligible: integer("call_eligible", { mode: "boolean" }).notNull(),
  eye_eligible: integer("eye_eligible", { mode: "boolean" }).notNull(),
  dental_eligible: integer("dental_eligible", { mode: "boolean" }).notNull(),
  active_from: text("active_from").notNull(),
  active_until: text("active_until"),
})

export const providerUnavailability = sqliteTable("provider_unavailability", {
  unavailability_id: text("unavailability_id").primaryKey(),
  provider_id: text("provider_id")
    .notNull()
    .references(() => provider.provider_id),
  start_date: text("start_date").notNull(),
  end_date: text("end_date").notNull(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
})

export const demandTemplate = sqliteTable("demand_template", {
  template_id: text("template_id").primaryKey(),
  weekday: text("weekday").notNull(),
  room_count: integer("room_count").notNull(),
  normal_list_slots: integer("normal_list_slots").notNull(),
  eye_slots: integer("eye_slots").notNull(),
  dental_slots: integer("dental_slots").notNull(),
  call_required: integer("call_required", { mode: "boolean" }).notNull(),
  active_from: text("active_from").notNull(),
  active_until: text("active_until"),
})

export const dateDemandException = sqliteTable("date_demand_exception", {
  exception_id: text("exception_id").primaryKey(),
  date: text("date").notNull(),
  room_count: integer("room_count").notNull(),
  normal_list_slots: integer("normal_list_slots").notNull(),
  eye_slots: integer("eye_slots").notNull(),
  dental_slots: integer("dental_slots").notNull(),
  call_required: integer("call_required", { mode: "boolean" }).notNull(),
  label: text("label").notNull(),
})

export const weekendBlock = sqliteTable("weekend_block", {
  weekend_block_id: text("weekend_block_id").primaryKey(),
  label: text("label").notNull(),
  dates: text("dates", { mode: "json" }).notNull().$type<string[]>(),
  split_required: integer("split_required", { mode: "boolean" }).notNull(),
  required_distinct_call_providers: integer("required_distinct_call_providers").notNull(),
})

export const holiday = sqliteTable("holiday", {
  holiday_id: text("holiday_id").primaryKey(),
  date: text("date").notNull(),
  label: text("label").notNull(),
  class: text("class").notNull(),
  weekend_block_id: text("weekend_block_id").references(() => weekendBlock.weekend_block_id),
})

export const openingLedger = sqliteTable(
  "opening_ledger",
  {
    provider_id: text("provider_id")
      .notNull()
      .references(() => provider.provider_id),
    cycle_start: text("cycle_start").notNull(),
    as_of_date: text("as_of_date").notNull(),
    call_burden: real("call_burden").notNull(),
    weekend_burden: real("weekend_burden").notNull(),
    holiday_burden: real("holiday_burden").notNull(),
    first_count: integer("first_count").notNull(),
    second_count: integer("second_count").notNull(),
    middle_count: integer("middle_count").notNull(),
    last_count: integer("last_count").notNull(),
    eye_count: integer("eye_count").notNull(),
    dental_count: integer("dental_count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider_id, t.cycle_start] })],
)

export const scheduleRun = sqliteTable("schedule_run", {
  run_id: text("run_id").primaryKey(),
  created_at: text("created_at").notNull(),
  horizon_start: text("horizon_start").notNull(),
  horizon_end: text("horizon_end").notNull(),
  status: text("status").notNull(),
  planning_snapshot_json: text("planning_snapshot_json", { mode: "json" }).notNull(),
  compiled_scenario_json: text("compiled_scenario_json", { mode: "json" }).notNull(),
  compiled_scenario_hash: text("compiled_scenario_hash").notNull(),
  schedule_result_json: text("schedule_result_json", { mode: "json" }).notNull(),
  engine_version: text("engine_version").notNull(),
  app_version: text("app_version").notNull(),
  solver_backend: text("solver_backend").notNull(),
})
