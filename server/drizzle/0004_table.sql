CREATE TABLE `scene` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`text_public` text DEFAULT '' NOT NULL,
	`text_gm` text DEFAULT '' NOT NULL,
	`image_file` text,
	`image_w` integer,
	`image_h` integer,
	`image_bytes` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scene_room_idx` ON `scene` (`room_id`);--> statement-breakpoint
CREATE TABLE `table_state` (
	`room_id` text PRIMARY KEY NOT NULL,
	`scene_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `scene`(`id`) ON UPDATE no action ON DELETE set null
);
