ALTER TABLE `worlds` DROP COLUMN `kind`;--> statement-breakpoint
ALTER TABLE `worlds` DROP COLUMN `forecast_id`;--> statement-breakpoint
ALTER TABLE `forecasts` DROP COLUMN `state`;--> statement-breakpoint
ALTER TABLE `forecasts` DROP COLUMN `knowledge`;--> statement-breakpoint
ALTER TABLE `forecasts` ADD `lookups` text;--> statement-breakpoint
DROP TABLE `intel`;--> statement-breakpoint
DROP TABLE `forecast_versions`;--> statement-breakpoint
DROP TABLE `forecast_messages`;--> statement-breakpoint
DROP TABLE `forecast_revisits`;
