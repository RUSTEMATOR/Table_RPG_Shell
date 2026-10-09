CREATE TABLE `shell_unlock` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`character_id` text NOT NULL,
	`kind` text NOT NULL,
	`shell` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shell_unlock_character_idx` ON `shell_unlock` (`character_id`);