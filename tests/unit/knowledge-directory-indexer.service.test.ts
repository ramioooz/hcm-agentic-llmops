import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeDirectoryIndexer } from '../../src/services/knowledge-directory-indexer.service';
import { KnowledgeIngestionService } from '../../src/services/knowledge-ingestion.service';

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation((input: { data: Uint8Array }) => ({
    getText: async () => ({
      total: 1,
      pages: [{ num: 1, text: Buffer.from(input.data).toString('utf8') }],
    }),
    destroy: async () => undefined,
  })),
}));

describe('KnowledgeDirectoryIndexer', () => {
  test('indexes only PDF files in stable order and continues after a file failure', async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'knowledge-indexer-'));
    const directory = join(repositoryRoot, 'knowledge-documents');
    await mkdir(join(directory, 'nested'), { recursive: true });
    await Promise.all([
      writeFile(join(directory, 'alpha.pdf'), 'unchanged source'),
      writeFile(join(directory, 'nested', 'beta.pdf'), 'updated source'),
      writeFile(join(directory, 'ignored.md'), 'unsupported'),
      writeFile(join(directory, 'ignored.txt'), 'unsupported'),
      writeFile(join(directory, 'nested', 'ignored.docx'), 'unsupported'),
      mkdir(join(directory, 'broken.pdf')),
    ]);

    const described = jest.fn(async (buffer: Buffer) => ({
      contentHash: buffer.toString('utf8') === 'unchanged source' ? 'same' : 'changed',
      embeddingModel: 'embedding-test',
      chunkingVersion: 'chunking-test',
    }));
    const ingest = jest.fn(async (input: { originalFileName: string; documentId?: string }) => ({
      documentId: input.documentId ?? `created-${input.originalFileName}`,
      activeIndexVersion: 1,
      contentHash: 'published',
      chunkCount: 1,
    }));
    const findActiveIndexBySourcePath = jest.fn(async (sourcePath: string) =>
      sourcePath === 'knowledge-documents/alpha.pdf'
        ? {
            documentId: 'existing-alpha',
            contentHash: 'same',
            embeddingModel: 'embedding-test',
            chunkingVersion: 'chunking-test',
          }
        : sourcePath === 'knowledge-documents/nested/beta.pdf'
          ? {
              documentId: 'existing-beta',
              contentHash: 'stale',
              embeddingModel: 'embedding-test',
              chunkingVersion: 'chunking-test',
            }
          : null,
    );
    const indexer = new KnowledgeDirectoryIndexer({
      repositoryRoot,
      actorEmployeeCode: 'EMP-100',
      correlationId: 'test-correlation',
      repository: { findActiveIndexBySourcePath },
      ingestion: { describeIndex: described, ingest },
    });

    const results = await indexer.indexDirectory(directory);

    expect(results).toEqual([
      expect.objectContaining({ sourcePath: 'knowledge-documents/alpha.pdf', status: 'SKIPPED' }),
      expect.objectContaining({
        sourcePath: 'knowledge-documents/broken.pdf',
        status: 'FAILED',
        code: 'KNOWLEDGE_FILE_READ_FAILED',
      }),
      expect.objectContaining({
        sourcePath: 'knowledge-documents/nested/beta.pdf',
        status: 'UPDATED',
        documentId: 'existing-beta',
      }),
    ]);
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls.map(([input]) => input.originalFileName)).toEqual(['beta.pdf']);
    expect(ingest.mock.calls[0]?.[0]).toMatchObject({
      documentId: 'existing-beta',
      sourcePath: 'knowledge-documents/nested/beta.pdf',
    });
    expect(described).toHaveBeenCalledTimes(2);
  });

  test('reports safe operation-specific failures and continues indexing later files', async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'knowledge-indexer-diagnostics-'));
    const directory = join(repositoryRoot, 'knowledge-documents');
    await mkdir(directory, { recursive: true });
    await Promise.all(
      ['alpha.pdf', 'beta.pdf', 'gamma.pdf', 'omega.pdf'].map((fileName) =>
        writeFile(join(directory, fileName), fileName),
      ),
    );

    const rawReadFailure = 'database host and credential detail';
    const rawEmbeddingFailure = 'provider response included sensitive detail';
    const rawWriteFailure = 'database write included connection detail';
    const findActiveIndexBySourcePath = jest.fn(async (sourcePath: string) => {
      if (sourcePath.endsWith('/alpha.pdf')) throw new Error(rawReadFailure);
      return null;
    });
    const embedDocuments = jest.fn(async (documents: string[]) => {
      if (documents.some((document) => document.includes('beta.pdf'))) {
        throw new Error(rawEmbeddingFailure);
      }
      return documents.map(() => Array<number>(1_536).fill(0));
    });
    const publishVersion = jest.fn(async (input: { originalFileName: string }) => {
      if (input.originalFileName === 'gamma.pdf') throw new Error(rawWriteFailure);
      return {
        documentId: `created-${input.originalFileName}`,
        activeIndexVersion: 1,
        contentHash: 'published',
        chunkCount: 1,
      };
    });
    const ingestion = new KnowledgeIngestionService({
      repository: {
        hasActiveDocument: jest.fn(),
        findActiveIndexBySourcePath,
        publishVersion,
        searchActiveChunks: jest.fn(),
      },
      embeddings: { embedDocuments },
      embeddingModel: 'embedding-test',
      security: { inspect: async () => ({ safe: true as const }) },
    });
    const indexer = new KnowledgeDirectoryIndexer({
      repositoryRoot,
      actorEmployeeCode: 'EMP-100',
      correlationId: 'test-correlation',
      repository: { findActiveIndexBySourcePath },
      ingestion,
    });

    const results = await indexer.indexDirectory(directory);

    expect(results).toEqual([
      {
        sourcePath: 'knowledge-documents/alpha.pdf',
        status: 'FAILED',
        code: 'KNOWLEDGE_DATABASE_READ_FAILED',
      },
      {
        sourcePath: 'knowledge-documents/beta.pdf',
        status: 'FAILED',
        code: 'KNOWLEDGE_EMBEDDING_FAILED',
      },
      {
        sourcePath: 'knowledge-documents/gamma.pdf',
        status: 'FAILED',
        code: 'KNOWLEDGE_DATABASE_WRITE_FAILED',
      },
      {
        sourcePath: 'knowledge-documents/omega.pdf',
        status: 'INDEXED',
        documentId: 'created-omega.pdf',
        activeIndexVersion: 1,
        chunkCount: 1,
      },
    ]);
    expect(JSON.stringify(results)).not.toContain(rawReadFailure);
    expect(JSON.stringify(results)).not.toContain(rawEmbeddingFailure);
    expect(JSON.stringify(results)).not.toContain(rawWriteFailure);
  });
});
