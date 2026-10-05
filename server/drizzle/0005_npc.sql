CREATE TABLE `npc` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`power` integer,
	`notes_gm` text DEFAULT '' NOT NULL,
	`image_file` text,
	`image_w` integer,
	`image_h` integer,
	`image_bytes` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `npc_room_idx` ON `npc` (`room_id`);--> statement-breakpoint
ALTER TABLE `game_session` ADD `opponent_npc_id` text REFERENCES npc(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `table_state` ADD `npc_id` text REFERENCES npc(id) ON DELETE set null;