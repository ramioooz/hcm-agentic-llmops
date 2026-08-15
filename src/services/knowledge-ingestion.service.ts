import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { PDFParse } from 'pdf-parse';
import type {
  KnowledgeEmbeddingProvider,
  KnowledgeRepository,
  KnowledgeVersionResult,
} from '../types/knowledge';
import type { KnowledgeSecurityService } from './knowledge-security.service';

export const MAX_KNOWLEDGE_FILE_BYTES = 5 * 1_024 * 1_024;
const MAX_EXTRACTED_CHARACTERS = 500_000;
const MAX_PDF_PAGES = 250;
const MAX_CHUNKS = 200;
const CHUNK_SIZE = 1_600;
const CHUNK_OVERLAP = 200;
const CHUNKING_VERSION = 'char-1600-overlap-200-v1';

const PDF_MEDIA_TYPE = 'application/pdf';

type ExtractedPage = { pageNumber: number; text: string };

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPages(input: {
  originalFileName: string;
  mediaType: string;
  buffer: Buffer;
}): Promise<ExtractedPage[]> {
  const extension = extname(input.originalFileName).toLowerCase();
  if (extension !== '.pdf' || input.mediaType !== PDF_MEDIA_TYPE) {
    throw new Error('KNOWLEDGE_FILE_TYPE_UNSUPPORTED');
  }

  const parser = new PDFParse({ data: new Uint8Array(input.buffer) });
  try {
    const result = await parser.getText({ first: MAX_PDF_PAGES });
    if (result.total > MAX_PDF_PAGES) throw new Error('KNOWLEDGE_EXTRACTION_LIMIT_EXCEEDED');
    return result.pages.map((page) => ({ pageNumber: page.num, text: normalizeText(page.text) }));
  } finally {
    await parser.destroy();
  }
}

function chunkPages(pages: ExtractedPage[]): Array<{
  chunkIndex: number;
  pageNumber: number;
  content: string;
}> {
  const chunks = [];
  let chunkIndex = 0;
  for (const page of pages) {
    for (let start = 0; start < page.text.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
      const content = page.text.slice(start, start + CHUNK_SIZE).trim();
      if (!content) continue;
      chunks.push({ chunkIndex, pageNumber: page.pageNumber, content });
      chunkIndex += 1;
      if (chunks.length > MAX_CHUNKS) throw new Error('KNOWLEDGE_EXTRACTION_LIMIT_EXCEEDED');
    }
  }
  return chunks;
}

export class KnowledgeIngestionService {
  public constructor(
    private readonly dependencies: {
      repository: KnowledgeRepository;
      embeddings: Pick<KnowledgeEmbeddingProvider, 'embedDocuments'>;
      embeddingModel: string;
      security: Pick<KnowledgeSecurityService, 'inspect'>;
    },
  ) {}

  public describeIndex(buffer: Buffer): {
    contentHash: string;
    embeddingModel: string;
    chunkingVersion: string;
  } {
    return {
      contentHash: createHash('sha256').update(buffer).digest('hex'),
      embeddingModel: this.dependencies.embeddingModel,
      chunkingVersion: CHUNKING_VERSION,
    };
  }

  public async ingest(input: {
    documentId?: string;
    sourcePath?: string;
    title: string;
    originalFileName: string;
    mediaType: string;
    buffer: Buffer;
    createdByEmployeeCode: string;
    correlationId: string;
  }): Promise<KnowledgeVersionResult> {
    if (input.buffer.length === 0 || input.buffer.length > MAX_KNOWLEDGE_FILE_BYTES) {
      throw new Error('KNOWLEDGE_FILE_SIZE_INVALID');
    }
    const title = input.title.trim();
    if (!title || title.length > 200) throw new Error('KNOWLEDGE_TITLE_INVALID');
    const { contentHash } = this.describeIndex(input.buffer);

    try {
      const pages = await extractPages(input);
      const extractedCharacters = pages.reduce((total, page) => total + page.text.length, 0);
      if (extractedCharacters === 0) throw new Error('KNOWLEDGE_TEXT_EMPTY');
      if (extractedCharacters > MAX_EXTRACTED_CHARACTERS) {
        throw new Error('KNOWLEDGE_EXTRACTION_LIMIT_EXCEEDED');
      }
      const chunks = chunkPages(pages);
      for (const chunk of chunks) {
        const risk = await this.dependencies.security.inspect({
          text: chunk.content,
          source: 'KNOWLEDGE_DOCUMENT',
          correlationId: input.correlationId,
          actorEmployeeCode: input.createdByEmployeeCode,
          metadata: {
            documentId: input.documentId,
            chunkIndex: chunk.chunkIndex,
            pageNumber: chunk.pageNumber,
          },
        });
        if (!risk.safe) throw new Error('KNOWLEDGE_DOCUMENT_UNSAFE');
      }
      const embeddings = await this.dependencies.embeddings.embedDocuments(
        chunks.map((chunk) => chunk.content),
      );
      if (embeddings.length !== chunks.length) throw new Error('EMBEDDING_COUNT_MISMATCH');

      return await this.dependencies.repository.publishVersion({
        documentId: input.documentId,
        title,
        originalFileName: input.originalFileName,
        mediaType: input.mediaType,
        contentHash,
        sourcePath: input.sourcePath,
        createdByEmployeeCode: input.createdByEmployeeCode,
        embeddingModel: this.dependencies.embeddingModel,
        chunkingVersion: CHUNKING_VERSION,
        chunks: chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] ?? [] })),
      });
    } finally {
      input.buffer.fill(0);
    }
  }
}
