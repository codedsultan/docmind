import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { AgentService } from './agent.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
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

async function buildService(provider: unknown, registry: unknown) {
  const mod = await Test.createTestingModule({
    providers: [
      AgentService,
      { provide: GENERATION_PROVIDER, useValue: provider },
      { provide: ToolRegistryService, useValue: registry },
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
): Promise<AgentSseEvent[]> {
  const events: AgentSseEvent[] = [];
  return service.run(query, 'user-1', (e) => events.push(e)).then(() => events);
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
