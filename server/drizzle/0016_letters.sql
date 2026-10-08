CREATE TABLE `letter` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`character_id` text NOT NULL,
	`from_name` text NOT NULL,
	`text` text NOT NULL,
	`note_gm` text DEFAULT '' NOT NULL,
	`deliver_at` integer NOT NULL,
	`delivered_at` integer,
	`read_at` integer,
	`reply` text DEFAULT '' NOT NULL,
	`replied_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `letter_room_char_idx` ON `letter` (`room_id`,`character_id`);--> statement-breakpoint
CREATE INDEX `letter_due_idx` ON `letter` (`delivered_at`,`deliver_at`);