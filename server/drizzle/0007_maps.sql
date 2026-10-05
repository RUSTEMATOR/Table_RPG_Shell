CREATE TABLE `map_party` (
	`room_id` text PRIMARY KEY NOT NULL,
	`map_id` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `map_place` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`map_id` text NOT NULL,
	`key` text,
	`name` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`side` text DEFAULT 'r' NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`ink` text,
	`visible` integer DEFAULT false NOT NULL,
	`note_gm` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_place_map_idx` ON `map_place` (`room_id`,`map_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `map_place_key_idx` ON `map_place` (`room_id`,`map_id`,`key`);--> statement-breakpoint
CREATE TABLE `map_player_note` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`member_id` text NOT NULL,
	`map_id` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_player_note_member_idx` ON `map_player_note` (`member_id`,`map_id`);--> statement-breakpoint
CREATE TABLE `map_region` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`map_id` text NOT NULL,
	`key` text NOT NULL,
	`visible` integer DEFAULT false NOT NULL,
	`note_gm` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `map_region_key_idx` ON `map_region` (`room_id`,`map_id`,`key`);--> statement-breakpoint
ALTER TABLE `table_state` ADD `map_id` text;--> statement-breakpoint
ALTER TABLE `table_state` ADD `map_focus` text;