CREATE TABLE `event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`audience` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_audience_seq_idx` ON `event` (`room_id`,`audience`,`seq`);--> statement-breakpoint
CREATE TABLE `game_session` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`opponent_name` text DEFAULT '' NOT NULL,
	`opponent_power` integer,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_session_room_idx` ON `game_session` (`room_id`);--> statement-breakpoint
CREATE TABLE `roll` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`session_id` text,
	`member_id` text NOT NULL,
	`character_id` text,
	`character_name` text,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	`visibility` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`outcome` text NOT NULL,
	`effect` text NOT NULL,
	`rule_text` text DEFAULT '' NOT NULL,
	`my_power` integer NOT NULL,
	`enemy_name` text,
	`enemy_power` integer,
	`corrected` integer DEFAULT false NOT NULL,
	`correction_note` text,
	`client_request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `game_session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roll_dedupe_idx` ON `roll` (`member_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `roll_room_idx` ON `roll` (`room_id`,`created_at`);