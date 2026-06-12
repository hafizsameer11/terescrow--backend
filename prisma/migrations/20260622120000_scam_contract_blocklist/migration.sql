-- CreateTable
CREATE TABLE `scam_contract_blocklist` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `blockchain` VARCHAR(50) NOT NULL,
    `contract_address` VARCHAR(255) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `source` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `scam_contract_blocklist_blockchain_contract_unique`(`blockchain`, `contract_address`),
    INDEX `scam_contract_blocklist_contract_address_idx`(`contract_address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed known fake USDT impersonator from hmstech incident (BSC)
INSERT INTO `scam_contract_blocklist` (`blockchain`, `contract_address`, `reason`, `source`)
VALUES (
    'bsc',
    '0x10806b71136785250455cab1fbafa06b228e8888',
    'Fake USDT impersonator — not official Tether BEP-20 (0x55d398...)',
    'incident'
);
