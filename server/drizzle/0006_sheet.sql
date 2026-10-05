CREATE TABLE `sheet_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`text_gm` text DEFAULT '' NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sheet_entry_character_idx` ON `sheet_entry` (`character_id`);