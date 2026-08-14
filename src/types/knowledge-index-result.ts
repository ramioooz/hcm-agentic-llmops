export type KnowledgeIndexStatus = 'INDEXED' | 'UPDATED' | 'SKIPPED' | 'FAILED';

export type KnowledgeIndexResult = {
  sourcePath: string;
  status: KnowledgeIndexStatus;
  documentId?: string;
  activeIndexVersion?: number;
  chunkCount?: number;
  code?: string;
};
