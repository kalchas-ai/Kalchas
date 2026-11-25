ALTER TABLE `worlds` ADD `engine` integer;--> statement-breakpoint
ALTER TABLE `worlds` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `decisions` ADD `story` text;--> statement-breakpoint
ALTER TABLE `decisions` ADD `move` text;--> statement-breakpoint
ALTER TABLE `decisions` ADD `patch` text;--> statement-breakpoint
ALTER TABLE `judgments` ADD `external` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `judgments` ADD `seen` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `judgments` ADD `step` integer;
