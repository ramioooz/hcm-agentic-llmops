import { type BaseCheckpointSaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { DevelopmentManagerNotification } from '../adapters/development-manager-notification';
import {
  buildOpenAiModelConfiguration,
  OpenAiHcmIntentNormalizer,
} from '../adapters/openai-hcm-intent-normalizer';
import { AgentController } from '../controllers/agent.controller';
import { LeaveRequestController } from '../controllers/leave-request.controller';
import { todayAsDateOnly } from '../helpers/onboarding-agent.helpers';
import { createLangSmithAgentTraceRecorder } from '../observability/langsmith-agent-trace-recorder';
import { PinoApplicationLogger } from '../observability/pino-application-logger';
import { PrismaAgentRunRepository } from '../repositories/agent-run.repository';
import { PrismaEmployeeRepository } from '../repositories/employee.repository';
import { PrismaLeaveRepository } from '../repositories/leave.repository';
import { HcmAgentService } from '../services/hcm-agent.service';
import { LeaveApprovalService } from '../services/leave-approval.service';
import { LeaveDocumentService } from '../services/leave-document.service';
import type { ApplicationEnvironment } from '../types/application-environment';

export function createAgentModule(input: {
  environment: ApplicationEnvironment;
  employees: PrismaEmployeeRepository;
  runs: PrismaAgentRunRepository;
  leaves: PrismaLeaveRepository;
  logger: PinoApplicationLogger;
  checkpointer: BaseCheckpointSaver;
}) {
  const clock = { today: todayAsDateOnly };
  const leaveApprovals = new LeaveApprovalService({ store: input.leaves, clock });
  const agent = new HcmAgentService({
    employees: input.employees,
    leaves: input.leaves,
    leaveApprovals,
    clock,
    recorder: input.runs,
    threadOwnership: input.runs,
    notifications: new DevelopmentManagerNotification(),
    normalizer: new OpenAiHcmIntentNormalizer(
      new ChatOpenAI(
        buildOpenAiModelConfiguration({
          apiKey: input.environment.openAiApiKey,
          model: input.environment.openAiModel,
        }),
      ),
    ),
    checkpointer: input.checkpointer,
    configuredModel: input.environment.openAiModel,
    ...(input.environment.langSmithTracing
      ? {
          traceRecorder: createLangSmithAgentTraceRecorder({
            apiKey: input.environment.langSmithApiKey as string,
            endpoint: input.environment.langSmithEndpoint,
            projectName: input.environment.langSmithProject,
          }),
        }
      : {}),
  });
  const leaveDocuments = new LeaveDocumentService({
    employees: input.employees,
    documents: input.leaves,
  });

  return {
    agent,
    agentController: new AgentController({ agent, logger: input.logger }),
    leaveRequestController: new LeaveRequestController({
      documents: leaveDocuments,
      logger: input.logger,
    }),
  };
}
