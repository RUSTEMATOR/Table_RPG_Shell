CREATE TABLE `map_group` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`map_id` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`move` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_group_room_idx` ON `map_group` (`room_id`);--> statement-breakpoint
CREATE TABLE `map_group_member` (
	`character_id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`group_id` text NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `map_group`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_group_member_group_idx` ON `map_group_member` (`group_id`);