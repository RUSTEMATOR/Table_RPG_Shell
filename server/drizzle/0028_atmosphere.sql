ALTER TABLE `table_state` ADD `weather` text DEFAULT 'clear' NOT NULL;--> statement-breakpoint
ALTER TABLE `table_state` ADD `daytime` text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE `table_state` ADD `ambient` text DEFAULT 'auto' NOT NULL;