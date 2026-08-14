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
import type { ApplicationEnvironment } from '../types/application-environment';

export function createAgentModule(input: {
  environment: ApplicationEnvironment;
  employees: PrismaEmployeeRepository;
  runs: PrismaAgentRunRepository;
  leaves: PrismaLeaveRepository;
  logger: PinoApplicationLogger;
  checkpointer: BaseCheckpointSaver;
}) {
  const agent = new HcmAgentService({
    employees: input.employees,
    leaves: input.leaves,
    leaveApprovals: input.leaves,
    clock: { today: todayAsDateOnly },
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
            projectName: input.environment.langSmithProject,
          }),
        }
      : {}),
  });

  return {
    agent,
    agentController: new AgentController({ agent, logger: input.logger }),
    leaveRequestController: new LeaveRequestController({
      approvals: input.leaves,
      logger: input.logger,
    }),
  };
}
