import { Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

export interface ParseResult {
  text: string;
  sourceType: 'pdf' | 'markdown' | 'txt';
}

@Injectable()
export class ParserService {
  async parse(
    buffer: Buffer,
    mimetype: string,
    filename: string,
  ): Promise<ParseResult> {
    if (mimetype === 'application/pdf' || filename.endsWith('.pdf')) {
      return this.parsePdf(buffer);
    }
    if (
      mimetype === 'text/markdown' ||
      filename.endsWith('.md') ||
      filename.endsWith('.mdx')
    ) {
      return this.parseMarkdown(buffer);
    }
    return this.parseText(buffer);
  }

  private async parsePdf(buffer: Buffer): Promise<ParseResult> {
    const pdf = new PDFParse({ data: buffer });
    try {
      const result = await pdf.getText();
      const text = result.pages.map((p) => p.text).join('\n\n');
      return { text, sourceType: 'pdf' };
    } catch {
      throw new Error(
        'Failed to parse PDF file. The file may be corrupted or password-protected.',
      );
    } finally {
      await pdf.destroy();
    }
  }

  private parseMarkdown(buffer: Buffer): ParseResult {
    const text = buffer.toString('utf-8');
    // Strip frontmatter (---...---)
    const cleaned = text.replace(/^---[\s\S]*?---\n*/, '').trim();
    return { text: cleaned, sourceType: 'markdown' };
  }

  private parseText(buffer: Buffer): ParseResult {
    const text = buffer.toString('utf-8');
    return { text, sourceType: 'txt' };
  }
}
