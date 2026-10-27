-- Store bcrypt PIN hashes (was VARCHAR(4) for plaintext only).
ALTER TABLE `User` MODIFY COLUMN `pin` VARCHAR(255) NULL;
