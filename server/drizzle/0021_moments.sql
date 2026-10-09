CREATE TABLE `moment` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`character_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`roll_id` text,
	`note_gm` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`roll_id`) REFERENCES `roll`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `moment_character_idx` ON `moment` (`character_id`,`created_at`);