ALTER TABLE `map_rumor` ADD `reveal_at` integer;--> statement-breakpoint
ALTER TABLE `map_rumor` ADD `author_member_id` text REFERENCES member(id);--> statement-breakpoint
ALTER TABLE `map_rumor` ADD `proposed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `map_rumor` ADD `first_heard_by` text REFERENCES member(id);--> statement-breakpoint
ALTER TABLE `map_rumor` ADD `first_heard_at` integer;--> statement-breakpoint
CREATE INDEX `map_rumor_due_idx` ON `map_rumor` (`visible`,`reveal_at`);