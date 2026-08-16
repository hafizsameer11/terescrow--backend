-- Prembly fields on Tier 2 KYC
ALTER TABLE `KycStateTwo`
  ADD COLUMN `prembly_verified` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `prembly_reference` VARCHAR(120) NULL,
  ADD COLUMN `prembly_nin_confidence` DOUBLE NULL,
  ADD COLUMN `prembly_bvn_confidence` DOUBLE NULL,
  ADD COLUMN `prembly_verified_first_name` VARCHAR(80) NULL,
  ADD COLUMN `prembly_verified_last_name` VARCHAR(80) NULL,
  ADD COLUMN `prembly_verified_dob` VARCHAR(30) NULL,
  ADD COLUMN `prembly_phone` VARCHAR(30) NULL,
  ADD COLUMN `prembly_gender` VARCHAR(20) NULL,
  ADD COLUMN `prembly_payload` JSON NULL;
