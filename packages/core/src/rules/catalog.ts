import { Schema } from "effect"

// Canonical rule catalog. One owner for hard-rule and soft-objective IDs. Severity is encoded by
// which list an ID belongs to: hard rules are constraints (never violated for feasible results),
// soft rules are objective components reported as scorecard contributions.

export const HardRuleId = Schema.Literal(
  "H_COVER_ALL_SLOTS",
  "H_PROVIDER_ONE_SLOT_PER_DAY",
  "H_PROVIDER_ACTIVE",
  "H_PROVIDER_AVAILABLE",
  "H_ROOM_CAPACITY",
  "H_CALL_ELIGIBLE_FOR_FIRST",
  "H_CALL_ELIGIBLE_FOR_SECOND_LAST",
  "H_NON_CALL_NO_WEEKEND_OR_HOLIDAY",
  "H_NO_CONSECUTIVE_CALLS",
  "H_POST_CALL_DAY_OFF",
  "H_EYE_ELIGIBILITY",
  "H_DENTAL_ELIGIBILITY",
  "H_WEEKEND_BLOCK_SPLIT",
  "H_HORIZON_COMPLETE",
  "H_CALL_REQUIRES_FIRST_SLOT",
)
export type HardRuleId = typeof HardRuleId.Type

export const SoftRuleId = Schema.Literal(
  "S_BALANCE_CALL_BURDEN",
  "S_BALANCE_WEEKEND_BURDEN",
  "S_BALANCE_HOLIDAY_BURDEN",
  "S_BALANCE_FIRST_COUNT",
  "S_BALANCE_SECOND_COUNT",
  "S_BALANCE_MIDDLE_COUNT",
  "S_BALANCE_LAST_COUNT",
  "S_BALANCE_EYE_COUNT",
  "S_BALANCE_DENTAL_COUNT",
  "S_BALANCE_WORKDAY_COUNT",
  "S_AVOID_WORK_CLUSTERS",
  "S_AVOID_WEEKEND_CLUSTERS",
)
export type SoftRuleId = typeof SoftRuleId.Type

export type RuleId = HardRuleId | SoftRuleId

export const HARD_RULE_IDS = HardRuleId.literals
export const SOFT_RULE_IDS = SoftRuleId.literals

export type RuleSeverity = "hard" | "soft"
export type RuleOwner = "domain" | "validation" | "solver" | "scorecard"

export type RuleMetadata<ID extends RuleId> = {
  id: ID
  severity: RuleSeverity
  owner: RuleOwner
  description: string
  metric: string
}

export const HARD_RULE_CATALOG = {
  H_COVER_ALL_SLOTS: {
    id: "H_COVER_ALL_SLOTS",
    severity: "hard",
    owner: "validation",
    description: "Every generated slot is assigned exactly once with canonical slot metadata.",
    metric: "hard_rule_report.violation_count",
  },
  H_PROVIDER_ONE_SLOT_PER_DAY: {
    id: "H_PROVIDER_ONE_SLOT_PER_DAY",
    severity: "hard",
    owner: "solver",
    description: "A provider can receive at most one slot per date.",
    metric: "hard_rule_report.violations",
  },
  H_PROVIDER_ACTIVE: {
    id: "H_PROVIDER_ACTIVE",
    severity: "hard",
    owner: "validation",
    description: "Assigned providers must be active on the assignment date.",
    metric: "hard_rule_report.violations",
  },
  H_PROVIDER_AVAILABLE: {
    id: "H_PROVIDER_AVAILABLE",
    severity: "hard",
    owner: "validation",
    description: "Assigned providers cannot be unavailable on the assignment date.",
    metric: "hard_rule_report.violations",
  },
  H_ROOM_CAPACITY: {
    id: "H_ROOM_CAPACITY",
    severity: "hard",
    owner: "validation",
    description: "Generated slots for a date cannot exceed room capacity.",
    metric: "hard_rule_report.violations",
  },
  H_CALL_ELIGIBLE_FOR_FIRST: {
    id: "H_CALL_ELIGIBLE_FOR_FIRST",
    severity: "hard",
    owner: "solver",
    description: "First-equivalent slots require call-eligible providers.",
    metric: "hard_rule_report.violations",
  },
  H_CALL_ELIGIBLE_FOR_SECOND_LAST: {
    id: "H_CALL_ELIGIBLE_FOR_SECOND_LAST",
    severity: "hard",
    owner: "solver",
    description: "Second and last-equivalent slots require call-eligible providers.",
    metric: "hard_rule_report.violations",
  },
  H_NON_CALL_NO_WEEKEND_OR_HOLIDAY: {
    id: "H_NON_CALL_NO_WEEKEND_OR_HOLIDAY",
    severity: "hard",
    owner: "solver",
    description: "Weekend and holiday assignments require call-eligible providers.",
    metric: "hard_rule_report.violations",
  },
  H_NO_CONSECUTIVE_CALLS: {
    id: "H_NO_CONSECUTIVE_CALLS",
    severity: "hard",
    owner: "solver",
    description: "A provider cannot hold derived call on adjacent dates.",
    metric: "scorecard.clusters.consecutive_call_violations",
  },
  H_POST_CALL_DAY_OFF: {
    id: "H_POST_CALL_DAY_OFF",
    severity: "hard",
    owner: "solver",
    description: "A provider cannot work the day after derived call.",
    metric: "scorecard.clusters.post_call_violations",
  },
  H_EYE_ELIGIBILITY: {
    id: "H_EYE_ELIGIBILITY",
    severity: "hard",
    owner: "solver",
    description: "Eye slots require eye-eligible providers.",
    metric: "hard_rule_report.violations",
  },
  H_DENTAL_ELIGIBILITY: {
    id: "H_DENTAL_ELIGIBILITY",
    severity: "hard",
    owner: "solver",
    description: "Dental slots require dental-eligible providers.",
    metric: "hard_rule_report.violations",
  },
  H_WEEKEND_BLOCK_SPLIT: {
    id: "H_WEEKEND_BLOCK_SPLIT",
    severity: "hard",
    owner: "solver",
    description: "Split-required weekend blocks use exactly the required distinct call providers.",
    metric: "hard_rule_report.violations",
  },
  H_HORIZON_COMPLETE: {
    id: "H_HORIZON_COMPLETE",
    severity: "hard",
    owner: "validation",
    description: "Every date in the planning horizon has a day demand entry.",
    metric: "hard_rule_report.violations",
  },
  H_CALL_REQUIRES_FIRST_SLOT: {
    id: "H_CALL_REQUIRES_FIRST_SLOT",
    severity: "hard",
    owner: "validation",
    description: "A call-required day must have a first-equivalent ordinary slot to carry derived call.",
    metric: "hard_rule_report.violations",
  },
} satisfies { [K in HardRuleId]: RuleMetadata<K> }

export const SOFT_RULE_CATALOG = {
  S_BALANCE_CALL_BURDEN: {
    id: "S_BALANCE_CALL_BURDEN",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize FTE-normalized call-burden deviation among call-eligible providers.",
    metric: "scorecard.objective_contributions.S_BALANCE_CALL_BURDEN",
  },
  S_BALANCE_WEEKEND_BURDEN: {
    id: "S_BALANCE_WEEKEND_BURDEN",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize FTE-normalized weekend-call burden deviation among call-eligible providers.",
    metric: "scorecard.objective_contributions.S_BALANCE_WEEKEND_BURDEN",
  },
  S_BALANCE_HOLIDAY_BURDEN: {
    id: "S_BALANCE_HOLIDAY_BURDEN",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize FTE-normalized holiday-call burden deviation among call-eligible providers.",
    metric: "scorecard.objective_contributions.S_BALANCE_HOLIDAY_BURDEN",
  },
  S_BALANCE_FIRST_COUNT: {
    id: "S_BALANCE_FIRST_COUNT",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize first-equivalent position count deviation among call-eligible providers.",
    metric: "scorecard.objective_contributions.S_BALANCE_FIRST_COUNT",
  },
  S_BALANCE_SECOND_COUNT: {
    id: "S_BALANCE_SECOND_COUNT",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize second-position count deviation among call-eligible providers.",
    metric: "scorecard.objective_contributions.S_BALANCE_SECOND_COUNT",
  },
  S_BALANCE_MIDDLE_COUNT: {
    id: "S_BALANCE_MIDDLE_COUNT",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize middle-equivalent count deviation among all working providers.",
    metric: "scorecard.objective_contributions.S_BALANCE_MIDDLE_COUNT",
  },
  S_BALANCE_LAST_COUNT: {
    id: "S_BALANCE_LAST_COUNT",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize last-equivalent position count deviation among call-eligible providers.",
    metric: "scorecard.objective_contributions.S_BALANCE_LAST_COUNT",
  },
  S_BALANCE_EYE_COUNT: {
    id: "S_BALANCE_EYE_COUNT",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize eye slot count deviation among eye-eligible providers.",
    metric: "scorecard.objective_contributions.S_BALANCE_EYE_COUNT",
  },
  S_BALANCE_DENTAL_COUNT: {
    id: "S_BALANCE_DENTAL_COUNT",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize dental slot count deviation among dental-eligible providers.",
    metric: "scorecard.objective_contributions.S_BALANCE_DENTAL_COUNT",
  },
  S_BALANCE_WORKDAY_COUNT: {
    id: "S_BALANCE_WORKDAY_COUNT",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize FTE-normalized workday-count deviation across providers.",
    metric: "scorecard.objective_contributions.S_BALANCE_WORKDAY_COUNT",
  },
  S_AVOID_WORK_CLUSTERS: {
    id: "S_AVOID_WORK_CLUSTERS",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize adjacent worked-day clusters.",
    metric: "scorecard.objective_contributions.S_AVOID_WORK_CLUSTERS",
  },
  S_AVOID_WEEKEND_CLUSTERS: {
    id: "S_AVOID_WEEKEND_CLUSTERS",
    severity: "soft",
    owner: "scorecard",
    description: "Minimize adjacent weekend-period clusters.",
    metric: "scorecard.objective_contributions.S_AVOID_WEEKEND_CLUSTERS",
  },
} satisfies { [K in SoftRuleId]: RuleMetadata<K> }
