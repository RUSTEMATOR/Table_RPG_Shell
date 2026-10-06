CREATE TABLE `map_proposal` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`member_id` text NOT NULL,
	`map_id` text NOT NULL,
	`place_id` text NOT NULL,
	`days` real NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `map_place`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_proposal_room_idx` ON `map_proposal` (`room_id`,`map_id`);--> statement-breakpoint
ALTER TABLE `map_party` ADD `move` text;