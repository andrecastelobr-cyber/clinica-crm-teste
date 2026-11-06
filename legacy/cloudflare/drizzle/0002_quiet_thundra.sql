CREATE TABLE `charges` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`patient` text NOT NULL,
	`description` text NOT NULL,
	`total_cents` integer NOT NULL,
	`installment_count` integer NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`clinic`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `installments` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`charge` text NOT NULL,
	`number` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`clinic`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`charge`) REFERENCES `charges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `charge_installment_number` ON `installments` (`charge`,`number`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic` text NOT NULL,
	`installment` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`paid_on` text NOT NULL,
	`actor` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`clinic`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`installment`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE no action
);
