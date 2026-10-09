CREATE TABLE `acquaintance` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`character_id` text NOT NULL,
	`npc_id` text NOT NULL,
	`first_place_id` text,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	`attitude` text DEFAULT 'unknown' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`npc_id`) REFERENCES `npc`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`first_place_id`) REFERENCES `map_place`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `acquaintance_once_idx` ON `acquaintance` (`character_id`,`npc_id`);--> statement-breakpoint
CREATE INDEX `acquaintance_npc_idx` ON `acquaintance` (`npc_id`);