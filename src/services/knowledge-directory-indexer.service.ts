import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  knowledgeMediaType,
  knowledgeTitle,
  normalizedSourcePath,
} from '../helpers/knowledge-file.helpers';
import { knowledgeError, knowledgeErrorCode } from '../helpers/knowledge-error.helpers';
import { MAX_KNOWLEDGE_FILE_BYTES } from './knowledge-ingestion.service';
import type { KnowledgeIndexResult } from '../types/knowledge-index-result';
import type { KnowledgeSourceFile } from '../types/knowledge-source-file';
import type { KnowledgeActiveIndex } from '../types/knowledge-active-index';
import type { KnowledgeVersionResult } from '../types/knowledge';

type DirectoryIndexerDependencies = {
  repositoryRoot: string;
  actorEmployeeCode: string;
  correlationId: string;
  repository: {
    findActiveIndexBySourcePath(sourcePath: string): Promise<KnowledgeActiveIndex | null>;
  };
  ingestion: {
    describeIndex(
      buffer: Buffer,
    ):
      | { contentHash: string; embeddingModel: string; chunkingVersion: string }
      | Promise<{ contentHash: string; embeddingModel: string; chunkingVersion: string }>;
    ingest(input: {
      documentId?: string;
      sourcePath: string;
      title: string;
      originalFileName: string;
      mediaType: string;
      buffer: Buffer;
      createdByEmployeeCode: string;
      correlationId: string;
    }): Promise<KnowledgeVersionResult>;
  };
};

async function discoverFiles(input: {
  rootDirectory: string;
  directory: string;
  files: KnowledgeSourceFile[];
}): Promise<void> {
  const entries = await readdir(input.directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = join(input.directory, entry.name);
    if (entry.isDirectory() && !knowledgeMediaType(entry.name)) {
      await discoverFiles({ ...input, directory: absolutePath });
      continue;
    }
    const mediaType = knowledgeMediaType(entry.name);
    if (!mediaType) continue;
    const details = await stat(absolutePath);
    input.files.push({
      absolutePath,
      sourcePath: normalizedSourcePath(input.rootDirectory, absolutePath),
      originalFileName: basename(absolutePath),
      title: knowledgeTitle(basename(absolutePath)),
      mediaType,
      size: details.size,
    });
  }
}

export class KnowledgeDirectoryIndexer {
  public constructor(private readonly dependencies: DirectoryIndexerDependencies) {}

  public async indexDirectory(rootDirectory: string): Promise<KnowledgeIndexResult[]> {
    const files: KnowledgeSourceFile[] = [];
    await discoverFiles({
      rootDirectory: this.dependencies.repositoryRoot,
      directory: rootDirectory,
      files,
    });
    files.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
    const results: KnowledgeIndexResult[] = [];

    for (const file of files) {
      try {
        if (file.size === 0 || file.size > MAX_KNOWLEDGE_FILE_BYTES) {
          throw new Error('KNOWLEDGE_FILE_SIZE_INVALID');
        }
        let buffer: Buffer;
        try {
          buffer = await readFile(file.absolutePath);
        } catch {
          throw new Error('KNOWLEDGE_FILE_READ_FAILED');
        }
        const identity = await this.dependencies.ingestion.describeIndex(buffer);
        let active: KnowledgeActiveIndex | null;
        try {
          active = await this.dependencies.repository.findActiveIndexBySourcePath(file.sourcePath);
        } catch (error) {
          throw knowledgeError(error, 'KNOWLEDGE_DATABASE_READ_FAILED');
        }
        if (
          active &&
          active.contentHash === identity.contentHash &&
          active.embeddingModel === identity.embeddingModel &&
          active.chunkingVersion === identity.chunkingVersion
        ) {
          buffer.fill(0);
          results.push({
            sourcePath: file.sourcePath,
            status: 'SKIPPED',
            documentId: active.documentId,
          });
          continue;
        }
        const published = await this.dependencies.ingestion.ingest({
          documentId: active?.documentId,
          sourcePath: file.sourcePath,
          title: file.title,
          originalFileName: file.originalFileName,
          mediaType: file.mediaType,
          buffer,
          createdByEmployeeCode: this.dependencies.actorEmployeeCode,
          correlationId: this.dependencies.correlationId,
        });
        results.push({
          sourcePath: file.sourcePath,
          status: active ? 'UPDATED' : 'INDEXED',
          documentId: published.documentId,
          activeIndexVersion: published.activeIndexVersion,
          chunkCount: published.chunkCount,
        });
      } catch (error) {
        results.push({
          sourcePath: file.sourcePath,
          status: 'FAILED',
          code: knowledgeErrorCode(error, 'KNOWLEDGE_INDEX_FAILED'),
        });
      }
    }
    return results;
  }
}
