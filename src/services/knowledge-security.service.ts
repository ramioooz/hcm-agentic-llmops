import { createHash } from 'node:crypto';
import { SecurityEventType, SecuritySeverity } from '../enums/security.enum';
import { evaluatePromptInjectionRisk } from '../security/prompt-injection-risk';
import type { ApplicationLogger } from '../types/application-logger';
import type { PromptInjectionRisk } from '../types/prompt-injection-risk';
import type { SecurityEventRecorder } from '../types/security-event-recorder';

type KnowledgeSecuritySource =
  'KNOWLEDGE_DOCUMENT' | 'KNOWLEDGE_QUERY' | 'RETRIEVED_EVIDENCE' | 'MODEL_OUTPUT';

type SafeKnowledgeMetadata = {
  documentId?: string;
  chunkId?: string;
  chunkIndex?: number;
  pageNumber?: number | null;
};

type DetectionInput = {
  text: string;
  source: KnowledgeSecuritySource;
  correlationId: string;
  actorEmployeeCode?: string;
  metadata?: SafeKnowledgeMetadata;
};

export class KnowledgeSecurityService {
  public constructor(
    private readonly dependencies: {
      recorder: SecurityEventRecorder;
      logger: ApplicationLogger;
    },
  ) {}

  public async inspect(input: DetectionInput): Promise<PromptInjectionRisk> {
    const decision = evaluatePromptInjectionRisk(input.text);
    if (!decision.safe) {
      await this.record({ ...input, reasonCode: decision.reasonCode });
    }
    return decision;
  }

  public async record(
    input: DetectionInput & {
      reasonCode:
        Extract<PromptInjectionRisk, { safe: false }>['reasonCode'] | 'UNGROUNDED_EXTERNAL_URL';
    },
  ): Promise<void> {
    const hashName =
      input.source === 'KNOWLEDGE_QUERY'
        ? 'queryHash'
        : input.source === 'MODEL_OUTPUT'
          ? 'outputHash'
          : 'contentHash';
    const details = {
      source: input.source,
      reasonCode: input.reasonCode,
      [hashName]: createHash('sha256').update(input.text).digest('hex'),
      ...input.metadata,
    };
    await this.dependencies.recorder.recordSecurityEvent({
      correlationId: input.correlationId,
      actorEmployeeCode: input.actorEmployeeCode,
      event: {
        eventType: SecurityEventType.PromptInjectionDetected,
        severity: SecuritySeverity.High,
        details,
      },
    });
    this.dependencies.logger.warn({
      event: 'knowledge.security.detected',
      correlationId: input.correlationId,
      status: 'REJECTED',
      code: input.reasonCode,
      details: { source: input.source },
    });
  }
}
