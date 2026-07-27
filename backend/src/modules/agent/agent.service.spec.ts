import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { AgentService } from './agent.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { ConversationsService } from '../conversations/conversations.service';
import { GENERATION_PROVIDER } from '../providers/generation.provider';
import { RiskTier } from '../../common/constants';
import type { AgentSseEvent } from './agent-sse.types';
import { isToolProposal } from '../tools/tool-proposal.type';

function makeProvider(responses: string[]) {
  let callCount = 0;
  return {
    model: 'mock-model',
    generate: jest.fn((): Promise<{ content: string }> =>
      Promise.resolve({
        content: responses[Math.min(callCount++, responses.length - 1)],
      }),
    ),
    generateStream: jest.fn(),
  };
}

function makeRegistry() {
  return {
    listTools: jest.fn().mockReturnValue([]),
    dispatch: jest.fn(),
  };
}

function makeConversations() {
  return {
    loadHistory: jest.fn().mockResolvedValue([]),
    appendUserMessage: jest.fn().mockResolvedValue(undefined),
    appendAssistantMessage: jest.fn().mockResolvedValue(undefined),
  };
}

async function buildService(
  provider: unknown,
  registry: unknown,
  conversations: unknown = makeConversations(),
) {
  const mod = await Test.createTestingModule({
    providers: [
      AgentService,
      { provide: GENERATION_PROVIDER, useValue: provider },
      { provide: ToolRegistryService, useValue: registry },
      { provide: ConversationsService, useValue: conversations },
      {
        provide: ConfigService,
        useValue: { get: jest.fn().mockReturnValue(undefined) },
      },
      { provide: EventEmitter2, useValue: { emit: jest.fn() } },
    ],
  }).compile();
  return mod.get(AgentService);
}

function collectEvents(
  service: AgentService,
  query: string,
  conversationId = 'conv-1',
): Promise<AgentSseEvent[]> {
  const events: AgentSseEvent[] = [];
  return service
    .run(query, 'user-1', conversationId, (e) => events.push(e))
    .then(() => events);
}

describe('AgentService', () => {
  it('emits token and done events for a simple final answer', async () => {
    const provider = makeProvider(['Hello from the agent!']);
    const registry = makeRegistry();
    const service = await buildService(provider, registry);

    const events = await collectEvents(service, 'Say hello');

    const types = events.map((e) => e.type);
    expect(types).toContain('token');
    expect(types).toContain('done');
  });

  it('emits tool_call and tool_result for a read tool, then done', async () => {
    const provider = makeProvider([
      JSON.stringify({ tool: 'search', params: { query: 'test' } }),
      'Final answer after search.',
    ]);
    const registry = makeRegistry();
    registry.dispatch.mockResolvedValue({ results: ['doc1'] });
    registry.listTools.mockReturnValue([
      {
        name: 'search',
        description: 'Search',
        riskTier: RiskTier.read,
      },
    ]);
    const service = await buildService(provider, registry);

    const events = await collectEvents(service, 'Search for test');

    expect(events.some((e) => e.type === 'tool_call')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('emits confirmation_required for external_write tool and stops', async () => {
    const proposal = {
      type: 'proposal' as const,
      toolName: 'send_email',
      preview: 'Send digest to user@example.com',
      confirmationToken: 'tok-abc',
    };

    const provider = makeProvider([
      JSON.stringify({ tool: 'send_email', params: { subject: 'Digest' } }),
    ]);
    const registry = makeRegistry();
    registry.dispatch.mockResolvedValue(proposal);
    const service = await buildService(provider, registry);

    const events = await collectEvents(service, 'Send email digest');

    const confirmEvent = events.find((e) => e.type === 'confirmation_required');
    expect(confirmEvent).toBeDefined();
    if (confirmEvent?.type === 'confirmation_required') {
      expect(isToolProposal(confirmEvent.data)).toBe(true);
    }
    // Agent must NOT emit 'done' — it paused waiting for confirmation
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('emits tool_result with error when dispatch throws, then continues', async () => {
    const provider = makeProvider([
      JSON.stringify({ tool: 'bad_tool', params: {} }),
      'Recovered after error.',
    ]);
    const registry = makeRegistry();
    registry.dispatch.mockRejectedValue(new Error('tool failure'));
    const service = await buildService(provider, registry);

    const events = await collectEvents(service, 'Use bad tool');

    const errEvent = events.find(
      (e) => e.type === 'tool_result' && 'error' in e.data,
    );
    expect(errEvent).toBeDefined();
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('short-circuits on a cited answer: emits citations, no second generate call', async () => {
    const provider = makeProvider([
      JSON.stringify({ tool: 'query_documents', params: { query: 'MVCC' } }),
    ]);
    const registry = makeRegistry();
    const citations = [
      { marker: '[1]', chunkId: 'chunk-1', documentTitle: 'Doc A', snippet: '...' },
    ];
    registry.dispatch.mockResolvedValue({
      answer: 'MVCC avoids locking [1].',
      citations,
    });
    registry.listTools.mockReturnValue([
      {
        name: 'query_documents',
        description: 'Search documents and return an answer with citations',
        riskTier: RiskTier.read,
      },
    ]);
    const service = await buildService(provider, registry);

    const events = await collectEvents(service, 'How does MVCC work?');

    const citationEvent = events.find((e) => e.type === 'citations');
    expect(citationEvent).toBeDefined();
    if (citationEvent?.type === 'citations') {
      expect(citationEvent.data).toEqual(citations);
    }

    const tokenContent = events
      .filter((e) => e.type === 'token')
      .map((e) => e.data)
      .join('');
    expect(tokenContent.trim()).toBe('MVCC avoids locking [1].');

    expect(events.some((e) => e.type === 'done')).toBe(true);
    // Only one generate() call — the outer model never re-synthesizes
    // the tool's own answer.
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it('seeds prior history into the first generate() call and persists both turns', async () => {
    const provider = makeProvider(['Sure, following up on that.']);
    const registry = makeRegistry();
    const conversations = makeConversations();
    const priorHistory = [
      { role: 'user' as const, content: 'What is MVCC?' },
      { role: 'assistant' as const, content: 'MVCC avoids locking.' },
    ];
    conversations.loadHistory.mockResolvedValue(priorHistory);
    const service = await buildService(provider, registry, conversations);

    await collectEvents(service, 'Tell me more', 'conv-42');

    expect(conversations.loadHistory).toHaveBeenCalledWith('conv-42');
    // First generate() call must include prior history ahead of the new query
    const firstCallArgs = provider.generate.mock.calls[0][0];
    expect(firstCallArgs.messages).toEqual([
      ...priorHistory,
      { role: 'user', content: 'Tell me more' },
    ]);

    // User query persisted immediately, assistant answer persisted at the end
    expect(conversations.appendUserMessage).toHaveBeenCalledWith(
      'conv-42',
      'Tell me more',
    );
    expect(conversations.appendAssistantMessage).toHaveBeenCalledWith(
      'conv-42',
      'Sure, following up on that.',
    );
  });

  it('does not persist an assistant message when the turn pauses on confirmation', async () => {
    const proposal = {
      type: 'proposal' as const,
      toolName: 'send_email',
      preview: 'Send digest to user@example.com',
      confirmationToken: 'tok-abc',
    };
    const provider = makeProvider([
      JSON.stringify({ tool: 'send_email', params: { subject: 'Digest' } }),
    ]);
    const registry = makeRegistry();
    registry.dispatch.mockResolvedValue(proposal);
    const conversations = makeConversations();
    const service = await buildService(provider, registry, conversations);

    await collectEvents(service, 'Send email digest');

    expect(conversations.appendUserMessage).toHaveBeenCalled();
    expect(conversations.appendAssistantMessage).not.toHaveBeenCalled();
  });

  it('respects max iterations guard', async () => {
    const provider = makeProvider([
      JSON.stringify({ tool: 'loop_tool', params: {} }),
    ]);
    const registry = makeRegistry();
    registry.dispatch.mockResolvedValue({ partial: true });
    // Override max iterations to 2 for the test
    const mod = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: GENERATION_PROVIDER, useValue: provider },
        { provide: ToolRegistryService, useValue: registry },
        { provide: ConversationsService, useValue: makeConversations() },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(2) },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    const service = mod.get(AgentService);

    const events = await collectEvents(service, 'Loop forever');

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    if (doneEvent?.type === 'done') {
      expect(doneEvent.data).toMatch(/max_iterations/);
    }
    // dispatch called at most 2 times
    expect(registry.dispatch).toHaveBeenCalledTimes(2);
  });
});

// ── SP10: parseModelOutput fencing / malformed JSON ────────────────

describe('AgentService — parseModelOutput fence stripping', () => {
  it('extracts a tool call from JSON wrapped in ```json fences', async () => {
    const fenced = '```json\n{"tool":"search","params":{"query":"test"}}\n```';
    const provider = makeProvider([fenced, 'Done.']);
    const registry = makeRegistry();
    registry.dispatch.mockResolvedValue({ results: [] });
    const service = await buildService(provider, registry);

    const events = await collectEvents(service, 'Search for test');

    expect(events.some((e) => e.type === 'tool_call')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('extracts a tool call from JSON wrapped in plain ``` fences', async () => {
    const fenced = '```\n{"tool":"search","params":{"query":"test"}}\n```';
    const provider = makeProvider([fenced, 'Done.']);
    const registry = makeRegistry();
    registry.dispatch.mockResolvedValue({ results: [] });
    const service = await buildService(provider, registry);

    const events = await collectEvents(service, 'Search for test');

    expect(events.some((e) => e.type === 'tool_call')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('treats genuinely malformed JSON as a final answer without leaking raw content', async () => {
    // Missing closing brace — definitely malformed
    const malformed = '{"tool":"search","params":{"query":"test"}';
    const provider = makeProvider([malformed]);
    const service = await buildService(provider, makeRegistry());

    const events = await collectEvents(service, 'Test malformed');
    const tokenContent = events
      .filter((e) => e.type === 'token')
      .map((e) => e.data)
      .join('');

    // Must emit tokens (final answer path) and done — never a tool_call
    expect(events.some((e) => e.type === 'token')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(events.some((e) => e.type === 'tool_call')).toBe(false);
    // Raw malformed JSON must never appear in the streamed response
    expect(tokenContent).not.toContain(
      '{"tool":"search","params":{"query":"test"}',
    );
  });

  it('treats JSON with trailing comma (invalid) as a final answer', async () => {
    const withTrailingComma = '{"tool":"search","params":{"query":"test"},}';
    const provider = makeProvider([withTrailingComma]);
    const service = await buildService(provider, makeRegistry());

    const events = await collectEvents(service, 'Test trailing comma');
    const tokenContent = events
      .filter((e) => e.type === 'token')
      .map((e) => e.data)
      .join('');

    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(events.some((e) => e.type === 'tool_call')).toBe(false);
    expect(tokenContent).not.toContain(
      '{"tool":"search","params":{"query":"test"},}',
    );
  });

  it('treats JSON with leading prose as a final answer', async () => {
    const withProse =
      'Sure, let me search for that.\n\n{"tool":"search","params":{}}';
    const provider = makeProvider([withProse]);
    const service = await buildService(provider, makeRegistry());

    const events = await collectEvents(service, 'Test prose');
    const tokenContent = events
      .filter((e) => e.type === 'token')
      .map((e) => e.data)
      .join('');

    // The regex requires the JSON to be the ONLY content; prose disqualifies it
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(events.some((e) => e.type === 'tool_call')).toBe(false);
    // Embedded raw JSON object must not appear verbatim in streamed tokens
    expect(tokenContent).not.toContain('{"tool":"search","params":{}}');
  });
});
