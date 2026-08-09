import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  KnowledgeRepository,
  KnowledgeVersionInput,
  KnowledgeVersionResult,
  RetrievedKnowledgeChunk,
} from '../types/knowledge';

const EMBEDDING_DIMENSIONS = 1_536;

function vectorLiteral(values: number[]): string {
  if (values.length !== EMBEDDING_DIMENSIONS || values.some((value) => !Number.isFinite(value))) {
    throw new Error('EMBEDDING_DIMENSION_MISMATCH');
  }
  return `[${values.join(',')}]`;
}

export class PrismaKnowledgeRepository implements KnowledgeRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async publishVersion(input: KnowledgeVersionInput): Promise<KnowledgeVersionResult> {
    const documentId = input.documentId ?? randomUUID();
    const preparation = await this.database.$transaction(async (transaction) => {
      if (!input.documentId) {
        await transaction.knowledgeDocument.create({
          data: {
            id: documentId,
            title: input.title,
            originalFileName: input.originalFileName,
            mediaType: input.mediaType,
            contentHash: input.contentHash,
            activeIndexVersion: 0,
            createdByEmployeeCode: input.createdByEmployeeCode,
          },
        });
      }

      const rows = await transaction.$queryRaw<Array<{ activeIndexVersion: number }>>`
        SELECT "active_index_version" AS "activeIndexVersion"
        FROM "knowledge_documents"
        WHERE "id" = ${documentId}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new Error('KNOWLEDGE_DOCUMENT_NOT_FOUND');
      const maximumRows = await transaction.$queryRaw<Array<{ maximum: number | null }>>`
        SELECT MAX("index_version")::integer AS "maximum"
        FROM "knowledge_chunks"
        WHERE "document_id" = ${documentId}
      `;
      const indexVersion = Math.max(current.activeIndexVersion, maximumRows[0]?.maximum ?? 0) + 1;

      for (const chunk of input.chunks) {
        await transaction.$executeRaw`
          INSERT INTO "knowledge_chunks" (
            "id", "document_id", "index_version", "embedding_model", "chunking_version",
            "chunk_index", "page_number", "content", "embedding"
          ) VALUES (
            ${randomUUID()}, ${documentId}, ${indexVersion}, ${input.embeddingModel},
            ${input.chunkingVersion}, ${chunk.chunkIndex}, ${chunk.pageNumber}, ${chunk.content},
            ${vectorLiteral(chunk.embedding)}::vector
          )
        `;
      }

      return { expectedActiveVersion: current.activeIndexVersion, indexVersion };
    });

    const activated = await this.database.knowledgeDocument.updateMany({
      where: { id: documentId, activeIndexVersion: preparation.expectedActiveVersion },
      data: {
        title: input.title,
        originalFileName: input.originalFileName,
        mediaType: input.mediaType,
        contentHash: input.contentHash,
        activeIndexVersion: preparation.indexVersion,
      },
    });
    if (activated.count !== 1) throw new Error('KNOWLEDGE_VERSION_ACTIVATION_CONFLICT');

    return {
      documentId,
      activeIndexVersion: preparation.indexVersion,
      contentHash: input.contentHash,
      chunkCount: input.chunks.length,
    };
  }

  public async searchActiveChunks(input: {
    embedding: number[];
    documentId?: string;
    limit: number;
  }): Promise<RetrievedKnowledgeChunk[]> {
    const vector = vectorLiteral(input.embedding);
    const documentFilter = input.documentId
      ? Prisma.sql`AND d."id" = ${input.documentId}`
      : Prisma.empty;
    return this.database.$queryRaw<RetrievedKnowledgeChunk[]>(Prisma.sql`
      SELECT
        d."id" AS "documentId",
        d."title" AS "documentTitle",
        c."id" AS "chunkId",
        c."chunk_index" AS "chunkIndex",
        c."page_number" AS "pageNumber",
        c."content",
        (1 - (c."embedding" <=> ${vector}::vector))::double precision AS "score"
      FROM "knowledge_chunks" c
      INNER JOIN "knowledge_documents" d
        ON d."id" = c."document_id"
       AND d."active_index_version" = c."index_version"
      WHERE TRUE ${documentFilter}
      ORDER BY c."embedding" <=> ${vector}::vector
      LIMIT ${input.limit}
    `);
  }
}
