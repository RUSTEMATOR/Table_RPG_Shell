CREATE TABLE `spark` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`character_id` text NOT NULL,
	`delta` integer NOT NULL,
	`kind` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`roll_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`roll_id`) REFERENCES `roll`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `spark_character_idx` ON `spark` (`character_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `roll` ADD `reroll_of` text;