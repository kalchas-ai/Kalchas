DROP TABLE `actor_states`;--> statement-breakpoint
ALTER TABLE `sim_events` DROP COLUMN `importance`;--> statement-breakpoint
ALTER TABLE `memories` DROP COLUMN `importance`;--> statement-breakpoint
ALTER TABLE `judgments` ADD `kind` text DEFAULT 'outcome' NOT NULL;--> statement-breakpoint
ALTER TABLE `judgments` ADD `estimated` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `judgments` ADD `note` text;
