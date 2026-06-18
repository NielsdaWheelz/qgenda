import { expect, test } from "bun:test"
import { HARD_RULE_CATALOG, HARD_RULE_IDS, SOFT_RULE_CATALOG, SOFT_RULE_IDS } from "../src/rules/catalog"

test("hard rule catalog has metadata for every hard rule id", () => {
  expect(Object.keys(HARD_RULE_CATALOG).sort()).toEqual([...HARD_RULE_IDS].sort())
  for (const id of HARD_RULE_IDS) {
    const rule = HARD_RULE_CATALOG[id]
    expect(rule.id).toBe(id)
    expect(rule.severity).toBe("hard")
    expect(rule.owner.length).toBeGreaterThan(0)
    expect(rule.description.length).toBeGreaterThan(0)
    expect(rule.metric.length).toBeGreaterThan(0)
  }
})

test("soft rule catalog has metadata for every soft rule id", () => {
  expect(Object.keys(SOFT_RULE_CATALOG).sort()).toEqual([...SOFT_RULE_IDS].sort())
  for (const id of SOFT_RULE_IDS) {
    const rule = SOFT_RULE_CATALOG[id]
    expect(rule.id).toBe(id)
    expect(rule.severity).toBe("soft")
    expect(rule.owner.length).toBeGreaterThan(0)
    expect(rule.description.length).toBeGreaterThan(0)
    expect(rule.metric.length).toBeGreaterThan(0)
  }
})
