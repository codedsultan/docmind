import type { ZodSchema } from 'zod';
import type { RiskTier } from '../../common/constants';

export interface ToolContext {
  userId: string;
  queryId?: string;
}

export interface Tool<TParams = unknown> {
  name: string;
  description: string;
  riskTier: RiskTier;
  schema: ZodSchema<TParams>;
  execute(params: TParams, ctx: ToolContext): Promise<unknown>;
}
