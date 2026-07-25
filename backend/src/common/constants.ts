/** Risk tier values — mirrors the Prisma RiskTier enum. */
export const RiskTier = {
  read: 'read',
  internalWrite: 'internal_write',
  externalWrite: 'external_write',
} as const;

export type RiskTier = (typeof RiskTier)[keyof typeof RiskTier];
