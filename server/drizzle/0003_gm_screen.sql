CREATE TABLE `ai_judgment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject_ref` text NOT NULL,
	`model` text NOT NULL,
	`answers` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_judgment_subject_idx` ON `ai_judgment` (`kind`,`subject_ref`);--> statement-breakpoint
CREATE TABLE `diary_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`member_id` text NOT NULL,
	`character_id` text,
	`text` text NOT NULL,
	`private` integer DEFAULT false NOT NULL,
	`request` integer DEFAULT false NOT NULL,
	`request_state` text,
	`reply` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `diary_member_idx` ON `diary_entry` (`member_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `diary_room_idx` ON `diary_entry` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `green_overload` (
	`character_id` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`eyes_at` integer DEFAULT 3 NOT NULL,
	`skin_at` integer DEFAULT 6 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_note` (
	`session_id` text PRIMARY KEY NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `game_session`(`id`) ON UPDATE no action ON DELETE cascade
);
