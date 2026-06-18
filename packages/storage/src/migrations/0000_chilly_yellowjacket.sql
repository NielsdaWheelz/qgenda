CREATE TABLE `date_demand_exception` (
	`exception_id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`room_count` integer NOT NULL,
	`normal_list_slots` integer NOT NULL,
	`eye_slots` integer NOT NULL,
	`dental_slots` integer NOT NULL,
	`call_required` integer NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `demand_template` (
	`template_id` text PRIMARY KEY NOT NULL,
	`weekday` text NOT NULL,
	`room_count` integer NOT NULL,
	`normal_list_slots` integer NOT NULL,
	`eye_slots` integer NOT NULL,
	`dental_slots` integer NOT NULL,
	`call_required` integer NOT NULL,
	`active_from` text NOT NULL,
	`active_until` text
);
--> statement-breakpoint
CREATE TABLE `holiday` (
	`holiday_id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`label` text NOT NULL,
	`class` text NOT NULL,
	`weekend_block_id` text,
	FOREIGN KEY (`weekend_block_id`) REFERENCES `weekend_block`(`weekend_block_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `opening_ledger` (
	`provider_id` text NOT NULL,
	`cycle_start` text NOT NULL,
	`as_of_date` text NOT NULL,
	`call_burden` real NOT NULL,
	`weekend_burden` real NOT NULL,
	`holiday_burden` real NOT NULL,
	`first_count` integer NOT NULL,
	`second_count` integer NOT NULL,
	`middle_count` integer NOT NULL,
	`last_count` integer NOT NULL,
	`eye_count` integer NOT NULL,
	`dental_count` integer NOT NULL,
	PRIMARY KEY(`provider_id`, `cycle_start`),
	FOREIGN KEY (`provider_id`) REFERENCES `provider`(`provider_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `provider` (
	`provider_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`fte` real NOT NULL,
	`call_eligible` integer NOT NULL,
	`eye_eligible` integer NOT NULL,
	`dental_eligible` integer NOT NULL,
	`active_from` text NOT NULL,
	`active_until` text
);
--> statement-breakpoint
CREATE TABLE `provider_unavailability` (
	`unavailability_id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `provider`(`provider_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `schedule_run` (
	`run_id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`horizon_start` text NOT NULL,
	`horizon_end` text NOT NULL,
	`status` text NOT NULL,
	`planning_snapshot_json` text NOT NULL,
	`compiled_scenario_json` text NOT NULL,
	`compiled_scenario_hash` text NOT NULL,
	`schedule_result_json` text NOT NULL,
	`engine_version` text NOT NULL,
	`app_version` text NOT NULL,
	`solver_backend` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weekend_block` (
	`weekend_block_id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`dates` text NOT NULL,
	`split_required` integer NOT NULL,
	`required_distinct_call_providers` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`timezone` text NOT NULL,
	`active_cycle_start` text NOT NULL,
	`active_cycle_end` text NOT NULL,
	`opening_ledger_start_fresh` integer NOT NULL
);
