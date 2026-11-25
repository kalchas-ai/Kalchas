CREATE TABLE `actor_states` (
	`branch_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`beliefs` text NOT NULL,
	`trust` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`branch_id`, `actor_id`)
);
--> statement-breakpoint
CREATE TABLE `actors` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`persona` text NOT NULL,
	`tier` text NOT NULL,
	`model` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `actors_world` ON `actors` (`world_id`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`parent_branch_id` text,
	`fork_step` integer,
	`sim_time` text NOT NULL,
	`step` integer NOT NULL,
	`seq` integer NOT NULL,
	`state` text NOT NULL,
	`rng_seed` integer NOT NULL,
	`rng_counter` integer NOT NULL,
	`status` text NOT NULL,
	`pending_action` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`step` integer NOT NULL,
	`sim_time` text NOT NULL,
	`situation` text NOT NULL,
	`chosen` text,
	`restatement` text,
	`event_seq_before` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `decisions_branch_step` ON `decisions` (`branch_id`,`step`);--> statement-breakpoint
CREATE TABLE `edges` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`weight` real NOT NULL,
	`veto` integer NOT NULL,
	`valid_from` text,
	`valid_to` text,
	`origin` text NOT NULL,
	`branch_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `edges_world` ON `edges` (`world_id`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`aliases` text NOT NULL,
	`summary` text NOT NULL,
	`importance` real NOT NULL,
	`tier` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entities_world` ON `entities` (`world_id`);--> statement-breakpoint
CREATE TABLE `exo_events` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`scope` text NOT NULL,
	`magnitude` real NOT NULL,
	`keywords` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exo_world_date` ON `exo_events` (`world_id`,`date`);--> statement-breakpoint
CREATE TABLE `facts` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`content` text NOT NULL,
	`occurred_at` text NOT NULL,
	`published_at` text,
	`visibility` text NOT NULL,
	`known_by` text NOT NULL,
	`entity_ids` text NOT NULL,
	`source_id` text,
	`quote` text,
	`confidence` real NOT NULL,
	`is_key` integer NOT NULL,
	`acquisition` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `facts_world_time` ON `facts` (`world_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `facts_world_hash` ON `facts` (`world_id`,`content_hash`);--> statement-breakpoint
CREATE TABLE `history_markers` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `markers_world_date` ON `history_markers` (`world_id`,`date`);--> statement-breakpoint
CREATE TABLE `job_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`at` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `job_logs_job` ON `job_logs` (`job_id`,`id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`world_id` text,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`checkpoint` text,
	`error` text,
	`attempts` integer NOT NULL,
	`heartbeat_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `judgments` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`branch_id` text,
	`sim_time` text,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`chosen` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `known_facts` (
	`branch_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`fact_id` text NOT NULL,
	`acquired_at` text NOT NULL,
	`via` text NOT NULL,
	PRIMARY KEY(`branch_id`, `actor_id`, `fact_id`)
);
--> statement-breakpoint
CREATE TABLE `llm_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text,
	`branch_id` text,
	`job_id` text,
	`role` text NOT NULL,
	`purpose` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`searches` integer NOT NULL,
	`ms` integer NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	`output` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_calls_world` ON `llm_calls` (`world_id`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`sim_time` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`importance` real NOT NULL,
	`event_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `memories_branch_actor` ON `memories` (`branch_id`,`actor_id`,`sim_time`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`kind` text NOT NULL,
	`sim_time` text NOT NULL,
	`title` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`start_point_id` text NOT NULL,
	`seat_entity_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sim_events` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`seq` integer NOT NULL,
	`sim_time` text NOT NULL,
	`wave` integer NOT NULL,
	`kind` text NOT NULL,
	`actor_id` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`visibility` text NOT NULL,
	`audience` text NOT NULL,
	`importance` real NOT NULL,
	`parent_ids` text NOT NULL,
	`status` text NOT NULL,
	`due_at` text,
	`payload` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_branch_seq` ON `sim_events` (`branch_id`,`seq`);--> statement-breakpoint
CREATE INDEX `events_branch_status` ON `sim_events` (`branch_id`,`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`branch_id` text NOT NULL,
	`step` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`branch_id`, `step`)
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`excerpt` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sources_world_url` ON `sources` (`world_id`,`url`);--> statement-breakpoint
CREATE TABLE `start_points` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`rationale` text NOT NULL,
	`difficulty` text NOT NULL,
	`seat_entity_id` text NOT NULL,
	`initial_metrics` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `start_world` ON `start_points` (`world_id`);--> statement-breakpoint
CREATE TABLE `worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt` text NOT NULL,
	`title` text,
	`status` text NOT NULL,
	`scope` text,
	`profile` text,
	`completeness` text,
	`endings` text,
	`budget_usd` real NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
