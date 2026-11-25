ALTER TABLE `entities` DROP COLUMN `importance`;--> statement-breakpoint
ALTER TABLE `entities` ADD `person` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `facts` DROP COLUMN `visibility`;--> statement-breakpoint
ALTER TABLE `facts` DROP COLUMN `confidence`;--> statement-breakpoint
ALTER TABLE `facts` DROP COLUMN `is_key`;--> statement-breakpoint
ALTER TABLE `facts` DROP COLUMN `acquisition`;--> statement-breakpoint
ALTER TABLE `facts` ADD `circles` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `edges` DROP COLUMN `type`;--> statement-breakpoint
ALTER TABLE `edges` DROP COLUMN `weight`;--> statement-breakpoint
ALTER TABLE `edges` DROP COLUMN `veto`;--> statement-breakpoint
ALTER TABLE `exo_events` DROP COLUMN `scope`;--> statement-breakpoint
ALTER TABLE `exo_events` DROP COLUMN `magnitude`;--> statement-breakpoint
ALTER TABLE `exo_events` DROP COLUMN `keywords`;--> statement-breakpoint
ALTER TABLE `actors` DROP COLUMN `tier`;--> statement-breakpoint
DROP TABLE `history_markers`;
