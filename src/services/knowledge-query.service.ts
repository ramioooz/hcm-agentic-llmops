import type {
  KnowledgeAnswerGenerator,
  KnowledgeEmbeddingProvider,
  KnowledgeQueryResult,
  KnowledgeRepository,
} from '../types/knowledge';

const INSUFFICIENT_EVIDENCE: KnowledgeQueryResult = {
  status: 'INSUFFICIENT_EVIDENCE',
  answer: 'Insufficient evidence in the indexed HR knowledge documents.',
  sources: [],
};

export class KnowledgeQueryService {
  public constructor(
    private readonly dependencies: {
      repository: Pick<KnowledgeRepository, 'searchActiveChunks'>;
      embeddings: Pick<KnowledgeEmbeddingProvider, 'embedQuery'>;
      answers: KnowledgeAnswerGenerator;
    },
  ) {}

  public async query(input: {
    query: string;
    documentId?: string;
    limit?: number;
  }): Promise<KnowledgeQueryResult> {
    const query = input.query.trim();
    if (!query || query.length > 2_000) throw new Error('KNOWLEDGE_QUERY_INVALID');
    const limit = Math.min(8, Math.max(1, input.limit ?? 5));
    const embedding = await this.dependencies.embeddings.embedQuery(query);
    const retrieved = await this.dependencies.repository.searchActiveChunks({
      embedding,
      documentId: input.documentId,
      limit,
    });
    const evidence = retrieved.filter((chunk) => chunk.score >= 0.65).slice(0, limit);
    if (evidence.length === 0) return INSUFFICIENT_EVIDENCE;

    const generated = await this.dependencies.answers.generate({ query, evidence });
    const cited = new Set(generated.citedChunkIds);
    const sources = evidence
      .filter((chunk) => cited.has(chunk.chunkId))
      .map(({ content: _content, score: _score, ...source }) => source);
    if (!generated.answer.trim() || sources.length === 0) return INSUFFICIENT_EVIDENCE;

    return { status: 'ANSWERED', answer: generated.answer.trim(), sources };
  }
}
