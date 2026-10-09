CREATE TABLE `questionnaire` (
	`member_id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`answers` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
