CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`patient` text NOT NULL,
	`professional` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`clinic`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`professional`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clinics` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`specialty` text NOT NULL,
	FOREIGN KEY (`clinic`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clinic_email` ON `members` (`clinic`,`email`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`patient` text NOT NULL,
	`author` text NOT NULL,
	`specialty` text NOT NULL,
	`subjective` text NOT NULL,
	`objective` text NOT NULL,
	`assessment` text NOT NULL,
	`plan` text NOT NULL,
	`tooth` text,
	`created` text NOT NULL,
	FOREIGN KEY (`clinic`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`name` text NOT NULL,
	`birth` text,
	`phone` text,
	`created` text NOT NULL,
	FOREIGN KEY (`clinic`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
