export const DOCUMENT_INGESTED_EVENT = 'document.ingested';

export class DocumentIngestedEvent {
  constructor(
    public readonly documentId: string,
    public readonly chunkCount: number,
    public readonly userId: string,
  ) {}
}
