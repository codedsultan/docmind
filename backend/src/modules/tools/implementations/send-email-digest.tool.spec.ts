import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SendEmailDigestTool } from './send-email-digest.tool';
import { EMAIL_SERVICE } from '../../email/email.interface';
import { GENERATION_PROVIDER } from '../../providers/generation.provider';
import { NotesService } from '../../notes/notes.service';
import { RiskTier } from '../../../common/constants';
import type { ToolContext } from '../tool.interface';

const DEV_CTX: ToolContext = { userId: 'dev-user-id' };

function buildTool(
  recipientEnv?: string,
  notesMock?: Partial<NotesService>,
  generationMock?: { generate: jest.Mock },
) {
  const emailService = { sendDigest: jest.fn().mockResolvedValue(undefined) };
  const configService = {
    get: jest.fn((key: string) =>
      key === 'EMAIL_DIGEST_RECIPIENT' ? recipientEnv : undefined,
    ),
  };
  const notesService: Partial<NotesService> = {
    findRecent: jest.fn().mockResolvedValue([]),
    ...notesMock,
  };
  const generationProvider = generationMock ?? {
    generate: jest.fn().mockResolvedValue({ content: 'Generated summary.' }),
  };

  return Test.createTestingModule({
    providers: [
      SendEmailDigestTool,
      { provide: ConfigService, useValue: configService },
      { provide: EMAIL_SERVICE, useValue: emailService },
      { provide: GENERATION_PROVIDER, useValue: generationProvider },
      { provide: NotesService, useValue: notesService },
    ],
  })
    .compile()
    .then((m) => ({
      tool: m.get(SendEmailDigestTool),
      emailService,
      configService,
      notesService: notesService as jest.Mocked<NotesService>,
      generationProvider,
    }));
}

describe('SendEmailDigestTool', () => {
  it('has riskTier external_write', async () => {
    const { tool } = await buildTool();
    expect(tool.riskTier).toBe(RiskTier.externalWrite);
  });

  it('accepts no params (schema is optional subject only)', async () => {
    const { tool } = await buildTool();
    const parsed = tool.schema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('reads EMAIL_DIGEST_RECIPIENT from config for the preview but does not include it in the result', async () => {
    const { tool } = await buildTool('digest@example.com');
    const result = (await tool.execute({}, DEV_CTX)) as {
      sent: boolean;
      subject: string;
    };
    expect(result.sent).toBe(true);
    expect('recipient' in result).toBe(false);
  });

  it('generates digest content from recent notes and passes it to EmailService.sendDigest', async () => {
    const sampleNotes = [
      {
        id: '1',
        content: 'First note',
        userId: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
        sourceQueryId: null,
      },
      {
        id: '2',
        content: 'Second note',
        userId: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
        sourceQueryId: null,
      },
    ];
    const generationMock = {
      generate: jest
        .fn()
        .mockResolvedValue({ content: 'AI-generated summary of notes.' }),
    };
    const { tool, emailService } = await buildTool(
      'digest@example.com',
      { findRecent: jest.fn().mockResolvedValue(sampleNotes) },
      generationMock,
    );

    await tool.execute({ subject: 'Weekly Digest' }, DEV_CTX);

    expect(generationMock.generate).toHaveBeenCalledTimes(1);
    expect(emailService.sendDigest).toHaveBeenCalledTimes(1);
    const [preview] = emailService.sendDigest.mock.calls[0] as [string];
    expect(preview).toContain('AI-generated summary of notes.');
    expect(preview).not.toContain('[Digest content would appear here]');
  });

  it('delegates to EmailService.sendDigest with subject and recipient in the preview', async () => {
    const { tool, emailService } = await buildTool('digest@example.com');
    await tool.execute({ subject: 'Weekly Digest' }, DEV_CTX);
    expect(emailService.sendDigest).toHaveBeenCalledTimes(1);
    const [preview] = emailService.sendDigest.mock.calls[0] as [string];
    expect(preview).toContain('Weekly Digest');
    expect(preview).toContain('digest@example.com');
  });

  it('uses a default subject when none is provided', async () => {
    const { tool } = await buildTool('a@b.com');
    const result = (await tool.execute({}, DEV_CTX)) as {
      subject: string;
    };
    expect(result.subject).toBe('Your DocMind Digest');
  });

  it('emits a no-notes message when the user has no notes', async () => {
    const { tool, emailService } = await buildTool('a@b.com', {
      findRecent: jest.fn().mockResolvedValue([]),
    });
    await tool.execute({}, DEV_CTX);
    const [preview] = emailService.sendDigest.mock.calls[0] as [string];
    expect(preview).toContain('no notes yet');
  });

  it('schema rejects a recipient param (recipient is config-only)', async () => {
    const { tool } = await buildTool();
    const parsed = tool.schema.safeParse({ recipient: 'hacker@evil.com' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('recipient' in parsed.data).toBe(false);
    }
  });
});
