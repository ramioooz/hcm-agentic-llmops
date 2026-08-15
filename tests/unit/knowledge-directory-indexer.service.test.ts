import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeDirectoryIndexer } from '../../src/services/knowledge-directory-indexer.service';

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
});
