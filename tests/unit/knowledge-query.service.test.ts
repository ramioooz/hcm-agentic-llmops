import { KnowledgeQueryService } from '../../src/services/knowledge-query.service';

describe('KnowledgeQueryService', () => {
  it('returns grounded active-version sources and a stable insufficient-evidence result', async () => {
    const repository = {
      searchActiveChunks: jest
        .fn()
        .mockResolvedValueOnce([
          {
            documentId: 'doc-policy',
            documentTitle: 'Fictional Flexible Work Policy',
            chunkId: 'chunk-2',
            chunkIndex: 2,
            pageNumber: 3,
            content: 'Eligible employees may work remotely for two days each week.',
            score: 0.91,
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const service = new KnowledgeQueryService({
      repository,
      embeddings: { embedQuery: async () => [0.25, 0.75] },
      answers: {
        generate: async () => ({
          answer: 'Eligible employees may work remotely for two days each week.',
          citedChunkIds: ['chunk-2'],
        }),
      },
    });

    const grounded = await service.query({
      query: 'How many remote days are allowed?',
      documentId: 'doc-policy',
      limit: 3,
    });
    const insufficient = await service.query({ query: 'What is the bicycle allowance?' });

    expect(repository.searchActiveChunks).toHaveBeenNthCalledWith(1, {
      embedding: [0.25, 0.75],
      documentId: 'doc-policy',
      limit: 3,
    });
    expect(grounded).toEqual({
      status: 'ANSWERED',
      answer: 'Eligible employees may work remotely for two days each week.',
      sources: [
        {
          documentId: 'doc-policy',
          documentTitle: 'Fictional Flexible Work Policy',
          chunkId: 'chunk-2',
          chunkIndex: 2,
          pageNumber: 3,
        },
      ],
    });
    expect(insufficient).toEqual({
      status: 'INSUFFICIENT_EVIDENCE',
      answer: 'Insufficient evidence in the indexed HR knowledge documents.',
      sources: [],
    });
  });
});
