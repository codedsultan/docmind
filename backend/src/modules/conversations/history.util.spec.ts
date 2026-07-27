import { trimHistory } from './history.util';
import type { ChatMessage } from '../providers/generation.provider';

function msg(role: 'user' | 'assistant', content: string): ChatMessage {
  return { role, content };
}

describe('trimHistory', () => {
  it('returns everything when under both caps', () => {
    const messages = [msg('user', 'hi'), msg('assistant', 'hello')];
    expect(trimHistory(messages)).toEqual(messages);
  });

  it('caps at maxMessages, keeping the most recent ones', () => {
    const messages = Array.from({ length: 30 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `msg-${i}`),
    );
    const result = trimHistory(messages, { maxMessages: 10 });
    expect(result).toHaveLength(10);
    expect(result[0].content).toBe('msg-20');
    expect(result[result.length - 1].content).toBe('msg-29');
  });

  it('trims older messages once the token budget is exceeded', () => {
    // Each message ~250 chars ≈ 63 tokens. Budget 100 tokens → keep ~1-2.
    const long = 'x'.repeat(250);
    const messages = [
      msg('user', long),
      msg('assistant', long),
      msg('user', long),
      msg('assistant', long),
    ];
    const result = trimHistory(messages, {
      maxMessages: 20,
      tokenBudget: 100,
    });
    expect(result.length).toBeLessThan(messages.length);
    // Must keep the newest message
    expect(result[result.length - 1]).toEqual(messages[messages.length - 1]);
  });

  it('always keeps at least the latest turn even if it alone exceeds the token budget', () => {
    const huge = 'x'.repeat(20000); // ~5000 tokens, way over any small budget
    const messages = [
      msg('user', 'earlier question'),
      msg('assistant', 'earlier answer'),
      msg('user', huge),
    ];
    const result = trimHistory(messages, { maxMessages: 20, tokenBudget: 50 });
    // minKeep = 2 → keeps at least the last 2 messages regardless of size
    expect(result).toHaveLength(2);
    expect(result[result.length - 1].content).toBe(huge);
  });

  it('applies the hard ceiling before the token budget pass', () => {
    const messages = Array.from({ length: 25 }, (_, i) =>
      msg('user', `m${i}`),
    );
    const result = trimHistory(messages, {
      maxMessages: 5,
      tokenBudget: 1_000_000, // budget effectively irrelevant here
    });
    expect(result).toHaveLength(5);
    expect(result[0].content).toBe('m20');
  });
});
