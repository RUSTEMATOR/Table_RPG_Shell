CREATE TABLE `battle` (
	`room_id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`cols` integer NOT NULL,
	`rows` integer NOT NULL,
	`terrain` text DEFAULT '[]' NOT NULL,
	`open` integer DEFAULT false NOT NULL,
	`player_moves` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `battle_token` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text,
	`label` text DEFAULT '' NOT NULL,
	`col` integer NOT NULL,
	`row` integer NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `battle`(`room_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `battle_token_room_idx` ON `battle_token` (`room_id`);