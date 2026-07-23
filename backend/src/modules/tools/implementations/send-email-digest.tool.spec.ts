import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SendEmailDigestTool } from './send-email-digest.tool';
import { EMAIL_SERVICE } from '../../email/email.interface';
import { RiskTier } from '../../../common/constants';

function buildTool(recipientEnv?: string) {
  const emailService = { sendDigest: jest.fn().mockResolvedValue(undefined) };
  const configService = {
    get: jest.fn((key: string) =>
      key === 'EMAIL_DIGEST_RECIPIENT' ? recipientEnv : undefined,
    ),
  };

  return Test.createTestingModule({
    providers: [
      SendEmailDigestTool,
      { provide: ConfigService, useValue: configService },
      { provide: EMAIL_SERVICE, useValue: emailService },
    ],
  })
    .compile()
    .then((m) => ({
      tool: m.get(SendEmailDigestTool),
      emailService,
      configService,
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
    const result = (await tool.execute({})) as {
      sent: boolean;
      subject: string;
    };
    expect(result.sent).toBe(true);
    expect('recipient' in result).toBe(false);
  });

  it('delegates to EmailService.sendDigest with the preview string', async () => {
    const { tool, emailService } = await buildTool('digest@example.com');
    await tool.execute({ subject: 'Weekly Digest' });
    expect(emailService.sendDigest).toHaveBeenCalledTimes(1);
    const [preview] = emailService.sendDigest.mock.calls[0] as [string];
    expect(preview).toContain('Weekly Digest');
    expect(preview).toContain('digest@example.com');
  });

  it('uses a default subject when none is provided', async () => {
    const { tool } = await buildTool('a@b.com');
    const result = (await tool.execute({})) as {
      subject: string;
    };
    expect(result.subject).toBe('Your DocMind Digest');
  });

  it('schema rejects a recipient param (recipient is config-only)', async () => {
    const { tool } = await buildTool();
    // The schema only allows `subject`, so extra fields are stripped (strict mode not set),
    // but a `recipient` field should not be present in the parsed output
    const parsed = tool.schema.safeParse({ recipient: 'hacker@evil.com' });
    // It parses successfully but `recipient` is stripped
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('recipient' in parsed.data).toBe(false);
    }
  });
});
