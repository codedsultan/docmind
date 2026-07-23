import type { InjectionToken } from '@nestjs/common';

export interface EmailService {
  sendDigest(preview: string): Promise<void>;
}

export const EMAIL_SERVICE: InjectionToken = 'EMAIL_SERVICE';
