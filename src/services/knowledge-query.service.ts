import type {
  KnowledgeAnswerGenerator,
  KnowledgeEmbeddingProvider,
  KnowledgeQueryResult,
  KnowledgeRepository,
} from '../types/knowledge';
import type { KnowledgeSecurityContext } from '../types/knowledge-security-context';
import type { KnowledgeSecurityService } from './knowledge-security.service';

const INSUFFICIENT_EVIDENCE: KnowledgeQueryResult = {
  status: 'INSUFFICIENT_EVIDENCE',
  answer: 'Insufficient evidence in the indexed HR knowledge documents.',
  sources: [],
};
const MINIMUM_COSINE_SIMILARITY = 0.5;
const absoluteUrlPattern = /https?:\/\/[^\s<>()"']+/gi;

function absoluteUrls(text: string): string[] {
  return text.match(absoluteUrlPattern) ?? [];
}

export class KnowledgeQueryService {
  public constructor(
    private readonly dependencies: {
      repository: Pick<KnowledgeRepository, 'searchActiveChunks'>;
      embeddings: Pick<KnowledgeEmbeddingProvider, 'embedQuery'>;
      answers: KnowledgeAnswerGenerator;
      security: Pick<KnowledgeSecurityService, 'inspect' | 'record'>;
    },
  ) {}

  public async query(input: {
    query: string;
    documentId?: string;
    limit?: number;
    securityContext: KnowledgeSecurityContext;
  }): Promise<KnowledgeQueryResult> {
    const query = input.query.trim();
    if (!query || query.length > 2_000) throw new Error('KNOWLEDGE_QUERY_INVALID');

    const queryRisk = await this.dependencies.security.inspect({
      text: query,
      source: 'KNOWLEDGE_QUERY',
      ...input.securityContext,
    });
    if (!queryRisk.safe) throw new Error('UNSAFE_KNOWLEDGE_QUERY');

    const limit = Math.min(8, Math.max(1, input.limit ?? 5));
    const embedding = await this.dependencies.embeddings.embedQuery(query);
    const retrieved = await this.dependencies.repository.searchActiveChunks({
      embedding,
      documentId: input.documentId,
      limit,
    });
    const evidence = retrieved
      .filter((chunk) => chunk.score >= MINIMUM_COSINE_SIMILARITY)
      .slice(0, limit);
    if (evidence.length === 0) return INSUFFICIENT_EVIDENCE;

    for (const chunk of evidence) {
      const evidenceRisk = await this.dependencies.security.inspect({
        text: chunk.content,
        source: 'RETRIEVED_EVIDENCE',
        ...input.securityContext,
        metadata: {
          documentId: chunk.documentId,
          chunkId: chunk.chunkId,
          chunkIndex: chunk.chunkIndex,
          pageNumber: chunk.pageNumber,
        },
      });
      if (!evidenceRisk.safe) return INSUFFICIENT_EVIDENCE;
    }

    const generated = await this.dependencies.answers.generate({ query, evidence });
    const outputRisk = await this.dependencies.security.inspect({
      text: generated.answer,
      source: 'MODEL_OUTPUT',
      ...input.securityContext,
    });
    if (!outputRisk.safe) return INSUFFICIENT_EVIDENCE;

    const cited = new Set(generated.citedChunkIds);
    const citedEvidence = evidence.filter((chunk) => cited.has(chunk.chunkId));
    const sources = citedEvidence.map((chunk) => ({
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
    }));
    if (!generated.answer.trim() || sources.length === 0) return INSUFFICIENT_EVIDENCE;

    const evidenceUrls = new Set(citedEvidence.flatMap((chunk) => absoluteUrls(chunk.content)));
    const ungroundedUrl = absoluteUrls(generated.answer).find((url) => !evidenceUrls.has(url));
    if (ungroundedUrl) {
      await this.dependencies.security.record({
        text: generated.answer,
        source: 'MODEL_OUTPUT',
        reasonCode: 'UNGROUNDED_EXTERNAL_URL',
        ...input.securityContext,
        metadata: {
          documentId: citedEvidence[0]?.documentId,
          chunkId: citedEvidence[0]?.chunkId,
          chunkIndex: citedEvidence[0]?.chunkIndex,
          pageNumber: citedEvidence[0]?.pageNumber,
        },
      });
      return INSUFFICIENT_EVIDENCE;
    }

    return { status: 'ANSWERED', answer: generated.answer.trim(), sources };
  }
}
