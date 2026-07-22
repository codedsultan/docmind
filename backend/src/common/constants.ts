/** Temporary user ID until Phase 5 retrofits JWT auth. */
export const DEV_USER_ID = 'dev-user-00000000-0000-0000-0000-000000000000';

/** Risk tier values — mirrors the Prisma RiskTier enum. */
export const RiskTier = {
  read: 'read',
  internalWrite: 'internal_write',
  externalWrite: 'external_write',
} as const;

export type RiskTier = (typeof RiskTier)[keyof typeof RiskTier];
