CREATE TABLE `map_presence` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`place_id` text NOT NULL,
	`spot_id` text,
	`npc_id` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`visible` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `map_place`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spot_id`) REFERENCES `map_spot`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`npc_id`) REFERENCES `npc`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_presence_place_idx` ON `map_presence` (`place_id`);--> statement-breakpoint
CREATE INDEX `map_presence_npc_idx` ON `map_presence` (`npc_id`);--> statement-breakpoint
CREATE TABLE `map_rumor` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`place_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`visible` integer DEFAULT false NOT NULL,
	`revealed_at` integer,
	`note_gm` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `map_place`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_rumor_place_idx` ON `map_rumor` (`place_id`);--> statement-breakpoint
CREATE TABLE `map_spot` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`place_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`note_gm` text DEFAULT '' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `map_place`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_spot_place_idx` ON `map_spot` (`place_id`);--> statement-breakpoint
ALTER TABLE `map_place` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `map_place` ADD `ruler` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `map_place` ADD `faction` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `map_place` ADD `population` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `map_place` ADD `image_file` text;--> statement-breakpoint
ALTER TABLE `map_place` ADD `image_w` integer;--> statement-breakpoint
ALTER TABLE `map_place` ADD `image_h` integer;--> statement-breakpoint
ALTER TABLE `map_place` ADD `image_bytes` integer;