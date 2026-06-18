import { PlanningState } from "@qgenda/core/planning/planningSchema"
import { asc } from "drizzle-orm"
import type { Db } from "../db"
import * as schema from "../schema"
import { strictDecode } from "../strictDecode"

// The whole local planning state, persisted across the nine planning tables. Reads reassemble and
// decode the rows back into the owned PlanningState; the whole-state replace runs in one transaction so
// readers never observe a partial swap (spec "Planning Bootstrap"). Foreign keys reject dangling
// provider/weekend-block references at write time.

export function getPlanning(db: Db): PlanningState | null {
  const [ws] = db.select().from(schema.workspace).all()
  if (ws === undefined) return null
  return strictDecode(PlanningState, {
    workspace: ws,
    providers: db.select().from(schema.provider).orderBy(asc(schema.provider.provider_id)).all(),
    unavailability: db
      .select()
      .from(schema.providerUnavailability)
      .orderBy(asc(schema.providerUnavailability.unavailability_id))
      .all(),
    demand_templates: db
      .select()
      .from(schema.demandTemplate)
      .orderBy(asc(schema.demandTemplate.weekday), asc(schema.demandTemplate.template_id))
      .all(),
    date_exceptions: db
      .select()
      .from(schema.dateDemandException)
      .orderBy(asc(schema.dateDemandException.date), asc(schema.dateDemandException.exception_id))
      .all(),
    holidays: db
      .select()
      .from(schema.holiday)
      .orderBy(asc(schema.holiday.date), asc(schema.holiday.holiday_id))
      .all(),
    weekend_blocks: db
      .select()
      .from(schema.weekendBlock)
      .orderBy(asc(schema.weekendBlock.weekend_block_id))
      .all(),
    opening_ledger: db
      .select()
      .from(schema.openingLedger)
      .orderBy(asc(schema.openingLedger.cycle_start), asc(schema.openingLedger.provider_id))
      .all(),
  })
}

export function replacePlanning(db: Db, state: PlanningState): void {
  db.transaction((tx) => {
    // Delete children before parents, then insert parents before children, to satisfy foreign keys.
    tx.delete(schema.openingLedger).run()
    tx.delete(schema.providerUnavailability).run()
    tx.delete(schema.holiday).run()
    tx.delete(schema.dateDemandException).run()
    tx.delete(schema.demandTemplate).run()
    tx.delete(schema.weekendBlock).run()
    tx.delete(schema.provider).run()
    tx.delete(schema.workspace).run()

    tx.insert(schema.workspace)
      .values({ ...state.workspace })
      .run()
    if (state.providers.length > 0)
      tx.insert(schema.provider)
        .values(state.providers.map((p) => ({ ...p })))
        .run()
    if (state.weekend_blocks.length > 0)
      tx.insert(schema.weekendBlock)
        .values(state.weekend_blocks.map((b) => ({ ...b, dates: [...b.dates] })))
        .run()
    if (state.unavailability.length > 0)
      tx.insert(schema.providerUnavailability)
        .values(state.unavailability.map((u) => ({ ...u })))
        .run()
    if (state.holidays.length > 0)
      tx.insert(schema.holiday)
        .values(state.holidays.map((h) => ({ ...h })))
        .run()
    if (state.demand_templates.length > 0)
      tx.insert(schema.demandTemplate)
        .values(state.demand_templates.map((d) => ({ ...d })))
        .run()
    if (state.date_exceptions.length > 0)
      tx.insert(schema.dateDemandException)
        .values(state.date_exceptions.map((d) => ({ ...d })))
        .run()
    if (state.opening_ledger.length > 0)
      tx.insert(schema.openingLedger)
        .values(state.opening_ledger.map((l) => ({ ...l })))
        .run()
  })
}
