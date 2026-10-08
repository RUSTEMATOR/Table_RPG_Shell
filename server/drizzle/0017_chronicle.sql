CREATE TABLE `chapter` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`session_id` text,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`quiz` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `game_session`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chapter_room_idx` ON `chapter` (`room_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `chapter_answer` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`member_id` text NOT NULL,
	`answers` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapter`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_answer_once_idx` ON `chapter_answer` (`chapter_id`,`member_id`);