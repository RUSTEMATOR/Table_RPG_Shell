CREATE TABLE `game_slot` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`kind` text NOT NULL,
	`starts_at` integer NOT NULL,
	`duration_min` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`reminded_day` integer DEFAULT false NOT NULL,
	`reminded_hour` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_slot_room_idx` ON `game_slot` (`room_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `game_slot_vote` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_id` text NOT NULL,
	`member_id` text NOT NULL,
	`answer` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `game_slot`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_slot_vote_once_idx` ON `game_slot_vote` (`slot_id`,`member_id`);