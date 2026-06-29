/**
 * V1 production compatibility flags.
 * Defaults preserve v1 behavior so v2 can deploy alongside existing mobile/admin clients.
 */
export const v1Compat = {
  blockUnverifiedLogin: process.env.BLOCK_UNVERIFIED_LOGIN === 'true',
  enableBannedCustomerChecks: process.env.ENABLE_BANNED_CUSTOMER_CHECKS === 'true',
  /** Backfill tier1 / fiat wallet / virtual accounts for verified customers (login, bootstrap, wallet reads). */
  enableV2UserSetup: process.env.ENABLE_V2_USER_SETUP !== 'false',
  /** Run full v2 setup immediately after first email verification. */
  enableV2PostVerifySetup: process.env.ENABLE_V2_POST_VERIFY_SETUP === 'true',
  enableV2RegisterReferral: process.env.ENABLE_V2_REGISTER_REFERRAL === 'true',
  enableReadOnlyReviewAgent: process.env.ENABLE_READ_ONLY_REVIEW_AGENT !== 'false',
  useV1AdminCustomerList: process.env.USE_V1_ADMIN_CUSTOMER_LIST !== 'false',
  useV1AccountActivityResponse: process.env.USE_V1_ACCOUNT_ACTIVITY_RESPONSE !== 'false',
  useV1KycUpdateLogic: process.env.USE_V1_KYC_UPDATE_LOGIC !== 'false',
  useV1LegacyKycTier: process.env.USE_V1_LEGACY_KYC_TIER !== 'false',
  autoChatProcessingStatus: process.env.AUTO_CHAT_PROCESSING_STATUS === 'true',
  useV1AdminCustomerDetail: process.env.USE_V1_ADMIN_CUSTOMER_DETAIL !== 'false',
  /** Tier1 auto-verify, fiat wallet, Tatum queue on email verify (needs v2 schema + Redis). */
  // enableV2PostVerifySetup: process.env.ENABLE_V2_POST_VERIFY_SETUP === 'true',
};

export function wantsLegacyQuery(req: { query?: Record<string, unknown> }): boolean {
  const legacy = req.query?.legacy;
  const v1 = req.query?.v1;
  return legacy === 'true' || v1 === 'true';
}
