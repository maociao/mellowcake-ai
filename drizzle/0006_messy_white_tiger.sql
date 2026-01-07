ALTER TABLE `chat_messages` ADD `image_prompts` text;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `short_temperature` real;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `long_temperature` real;