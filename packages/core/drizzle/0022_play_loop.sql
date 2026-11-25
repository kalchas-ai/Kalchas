DROP TABLE `meetings`;--> statement-breakpoint
DROP INDEX IF EXISTS `events_branch_status`;--> statement-breakpoint
ALTER TABLE `sim_events` DROP COLUMN `wave`;--> statement-breakpoint
ALTER TABLE `sim_events` DROP COLUMN `status`;--> statement-breakpoint
ALTER TABLE `sim_events` DROP COLUMN `due_at`;
