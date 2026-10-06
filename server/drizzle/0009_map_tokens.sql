CREATE TABLE `map_token` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`map_id` text NOT NULL,
	`character_id` text,
	`npc_id` text,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`npc_id`) REFERENCES `npc`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_token_map_idx` ON `map_token` (`room_id`,`map_id`);