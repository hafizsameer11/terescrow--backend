-- AlterTable
ALTER TABLE `agent` ADD COLUMN `AgentStatus` ENUM('offline', 'online') NOT NULL DEFAULT 'online';
