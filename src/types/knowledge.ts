export type KnowledgeChunkDraft = {
  chunkIndex: number;
  pageNumber: number | null;
  content: string;
  embedding: number[];
};

export type KnowledgeVersionInput = {
  documentId?: string;
  title: string;
  originalFileName: string;
  mediaType: string;
  contentHash: string;
  createdByEmployeeCode: string;
  embeddingModel: string;
  chunkingVersion: string;
  chunks: KnowledgeChunkDraft[];
};

export type KnowledgeVersionResult = {
  documentId: string;
  activeIndexVersion: number;
  contentHash: string;
  chunkCount: number;
};

export type RetrievedKnowledgeChunk = {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkIndex: number;
  pageNumber: number | null;
  content: string;
  score: number;
};

export type KnowledgeSource = Omit<RetrievedKnowledgeChunk, 'content' | 'score'>;

export interface KnowledgeRepository {
  publishVersion(input: KnowledgeVersionInput): Promise<KnowledgeVersionResult>;
  searchActiveChunks(input: {
    embedding: number[];
    documentId?: string;
    limit: number;
  }): Promise<RetrievedKnowledgeChunk[]>;
}

export interface KnowledgeEmbeddingProvider {
  embedDocuments(documents: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
}

export interface KnowledgeAnswerGenerator {
  generate(input: {
    query: string;
    evidence: RetrievedKnowledgeChunk[];
  }): Promise<{ answer: string; citedChunkIds: string[] }>;
}

export type KnowledgeQueryResult =
  | { status: 'ANSWERED'; answer: string; sources: KnowledgeSource[] }
  | { status: 'INSUFFICIENT_EVIDENCE'; answer: string; sources: [] };
