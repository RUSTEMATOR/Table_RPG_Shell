CREATE TABLE `bestiary_unlock` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`npc_id` text NOT NULL,
	`unlocked_at` integer NOT NULL,
	`by` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`npc_id`) REFERENCES `npc`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bestiary_unlock_once_idx` ON `bestiary_unlock` (`room_id`,`npc_id`);--> statement-breakpoint
ALTER TABLE `npc` ADD `bestiary` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `npc` ADD `bestiary_text` text DEFAULT '' NOT NULL;