export interface DocumentResponse {
  id: string;
  userId: string;
  title: string;
  sourceType: string;
  visibility: 'private' | 'public';
  status: 'pending' | 'processing' | 'ready' | 'failed';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResult {
  document: DocumentResponse;
  message: string;
}

export interface QuerySource {
  chunkId: string;
  documentId: string;
  content: string;
  similarity: number;
}

export interface QueryResponse {
  answer: string;
  sources: QuerySource[];
}
