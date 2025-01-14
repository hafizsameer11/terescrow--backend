-- DropForeignKey
ALTER TABLE `Notes` DROP FOREIGN KEY `Notes_agentId_fkey`;

-- AddForeignKey
ALTER TABLE `Notes` ADD CONSTRAINT `Notes_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
