CREATE TABLE `assessmentAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessmentId` int NOT NULL,
	`studentId` int NOT NULL,
	`schoolId` int NOT NULL,
	`teacherId` int NOT NULL,
	`assignedByUserId` int NOT NULL,
	`status` enum('ASSIGNED','REVOKED') NOT NULL DEFAULT 'ASSIGNED',
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessmentAssignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `assignment_assessment_student_unique` UNIQUE(`assessmentId`,`studentId`)
);
--> statement-breakpoint
CREATE TABLE `assessmentQuestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessmentId` int NOT NULL,
	`position` int NOT NULL,
	`type` enum('MCQ') NOT NULL DEFAULT 'MCQ',
	`questionText` text NOT NULL,
	`options` json NOT NULL,
	`correctOptionId` varchar(72) NOT NULL,
	`marks` decimal(8,2) NOT NULL DEFAULT '1.00',
	`negativeMarks` decimal(8,2) NOT NULL DEFAULT '0.00',
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assessmentQuestions_id` PRIMARY KEY(`id`),
	CONSTRAINT `assessment_question_position_unique` UNIQUE(`assessmentId`,`position`)
);
--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schoolId` int NOT NULL,
	`teacherId` int NOT NULL,
	`createdByUserId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`description` text,
	`startAt` timestamp NOT NULL,
	`endAt` timestamp NOT NULL,
	`durationMinutes` int NOT NULL,
	`maxAttempts` int NOT NULL DEFAULT 1,
	`accessCode` varchar(32),
	`accessCodeEnabled` boolean NOT NULL DEFAULT true,
	`randomizeQuestions` boolean NOT NULL DEFAULT false,
	`randomizeOptions` boolean NOT NULL DEFAULT false,
	`negativeMarking` boolean NOT NULL DEFAULT false,
	`antiCheat` json,
	`status` enum('DRAFT','PUBLISHED','ACTIVE','COMPLETED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessments_id` PRIMARY KEY(`id`),
	CONSTRAINT `assessments_access_code_unique` UNIQUE(`accessCode`)
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessmentId` int NOT NULL,
	`studentId` int NOT NULL,
	`schoolId` int NOT NULL,
	`teacherId` int NOT NULL,
	`status` enum('IN_PROGRESS','SUBMITTED','AUTO_SUBMITTED','EXPIRED') NOT NULL DEFAULT 'IN_PROGRESS',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`submittedAt` timestamp,
	`answers` json NOT NULL,
	`questionOrder` json NOT NULL,
	`score` decimal(9,2) NOT NULL DEFAULT '0.00',
	`percentage` decimal(6,2) NOT NULL DEFAULT '0.00',
	`violationCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int NOT NULL,
	`actorRole` enum('SUPER_ADMIN','ADMIN','TEACHER','STUDENT') NOT NULL,
	`schoolId` int,
	`action` varchar(100) NOT NULL,
	`targetType` varchar(80) NOT NULL,
	`targetId` varchar(80),
	`metadata` json,
	`ip` varchar(80),
	`userAgent` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `importBatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacherId` int NOT NULL,
	`schoolId` int NOT NULL,
	`sourceName` varchar(255) NOT NULL,
	`status` enum('PREVIEWED','CONFIRMED','REJECTED') NOT NULL DEFAULT 'PREVIEWED',
	`rows` json NOT NULL,
	`summary` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`confirmedAt` timestamp,
	CONSTRAINT `importBatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integrityViolations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attemptId` int NOT NULL,
	`studentId` int NOT NULL,
	`eventType` enum('TAB_HIDDEN','WINDOW_BLUR','FULLSCREEN_EXIT','COPY','PASTE','CUT','CONTEXT_MENU','SHORTCUT') NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	`metadata` json,
	CONSTRAINT `integrityViolations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`code` varchar(32) NOT NULL,
	`institutionType` varchar(80) NOT NULL,
	`contactEmail` varchar(320),
	`contactPhone` varchar(48),
	`address` text,
	`status` enum('ACTIVE','DISABLED','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schools_id` PRIMARY KEY(`id`),
	CONSTRAINT `schools_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `studentProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentUserId` int NOT NULL,
	`schoolId` int NOT NULL,
	`teacherId` int NOT NULL,
	`studentId` varchar(100),
	`usn` varchar(100),
	`branch` varchar(120),
	`semester` varchar(40),
	`section` varchar(40),
	`className` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `studentProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_profile_user_unique` UNIQUE(`studentUserId`),
	CONSTRAINT `student_profile_school_student_unique` UNIQUE(`schoolId`,`studentId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(180);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('SUPER_ADMIN','ADMIN','TEACHER','STUDENT') NOT NULL DEFAULT 'STUDENT';--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(80);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `schoolId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `teacherId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('ACTIVE','INACTIVE','DISABLED') DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lastLogin` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);--> statement-breakpoint
CREATE INDEX `assignment_student_status_idx` ON `assessmentAssignments` (`studentId`,`status`);--> statement-breakpoint
CREATE INDEX `assessment_question_assessment_idx` ON `assessmentQuestions` (`assessmentId`);--> statement-breakpoint
CREATE INDEX `assessments_school_status_idx` ON `assessments` (`schoolId`,`status`);--> statement-breakpoint
CREATE INDEX `assessments_teacher_idx` ON `assessments` (`teacherId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `attempts_assessment_student_idx` ON `attempts` (`assessmentId`,`studentId`);--> statement-breakpoint
CREATE INDEX `attempts_student_status_idx` ON `attempts` (`studentId`,`status`);--> statement-breakpoint
CREATE INDEX `attempts_school_teacher_idx` ON `attempts` (`schoolId`,`teacherId`);--> statement-breakpoint
CREATE INDEX `audit_school_created_idx` ON `auditLogs` (`schoolId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_actor_created_idx` ON `auditLogs` (`actorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `import_batch_teacher_idx` ON `importBatches` (`teacherId`,`status`);--> statement-breakpoint
CREATE INDEX `violations_attempt_idx` ON `integrityViolations` (`attemptId`,`recordedAt`);--> statement-breakpoint
CREATE INDEX `schools_status_idx` ON `schools` (`status`);--> statement-breakpoint
CREATE INDEX `student_profile_teacher_idx` ON `studentProfiles` (`teacherId`,`schoolId`);--> statement-breakpoint
CREATE INDEX `users_school_role_idx` ON `users` (`schoolId`,`role`);--> statement-breakpoint
CREATE INDEX `users_teacher_idx` ON `users` (`teacherId`);