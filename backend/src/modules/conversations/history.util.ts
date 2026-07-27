import type { ChatMessage } from '../providers/generation.provider';

/** Hard ceiling on the number of prior messages loaded into agent history. */
export const HISTORY_MAX_MESSAGES = 20;

/** Approximate token budget for the trimmed history window. */
export const HISTORY_TOKEN_BUDGET = 3000;

/** Rough chars-per-token heuristic — no tokenizer dependency needed for v1. */
const CHARS_PER_TOKEN = 4;

export interface TrimHistoryOptions {
  maxMessages?: number;
  tokenBudget?: number;
}

/**
 * Trims conversation history for replay into the agent's `messages` state.
 *
 * Two passes, applied in order:
 *  1. Hard ceiling — keep at most the last `maxMessages` rows. Bounds the
 *     DB read and gives a cheap worst case regardless of message length.
 *  2. Token budget — walk the remaining window newest-to-oldest, dropping
 *     older messages once the approximate token budget is exceeded.
 *
 * Always keeps at least the latest turn (last 2 messages, or fewer if the
 * conversation doesn't have that many yet), even if it alone exceeds the
 * token budget — a single long turn should never be silently dropped.
 */
export function trimHistory(
  messages: ChatMessage[],
  options: TrimHistoryOptions = {},
): ChatMessage[] {
  const maxMessages = options.maxMessages ?? HISTORY_MAX_MESSAGES;
  const tokenBudget = options.tokenBudget ?? HISTORY_TOKEN_BUDGET;

  const capped =
    messages.length > maxMessages ? messages.slice(-maxMessages) : messages;

  const minKeep = Math.min(2, capped.length);

  let tokens = 0;
  let keepFrom = 0;

  for (let i = capped.length - 1; i >= 0; i--) {
    const approxTokens = Math.ceil(capped[i].content.length / CHARS_PER_TOKEN);
    const keptSoFar = capped.length - i;
    const wouldExceed = tokens + approxTokens > tokenBudget;

    if (wouldExceed && keptSoFar > minKeep) {
      keepFrom = i + 1;
      break;
    }

    tokens += approxTokens;
    keepFrom = i;
  }

  return capped.slice(keepFrom);
}
