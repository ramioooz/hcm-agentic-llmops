import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { PrismaClient } from '@prisma/client';
import { PinoApplicationLogger } from '../observability/pino-application-logger';
import { PrismaAgentRunRepository } from '../repositories/agent-run.repository';
import { PrismaEmployeeRepository } from '../repositories/employee.repository';
import { PrismaLeaveRepository } from '../repositories/leave.repository';
import { PrismaProcessedEventRepository } from '../repositories/processed-event.repository';
import type { ApplicationEnvironment } from '../types/application-environment';

export function createCoreDependencies(environment: ApplicationEnvironment) {
  const database = new PrismaClient();
  const checkpointer = PostgresSaver.fromConnString(environment.databaseUrl);
  const logger = new PinoApplicationLogger();

  return {
    database,
    checkpointer,
    logger,
    employees: new PrismaEmployeeRepository(database),
    runs: new PrismaAgentRunRepository(database),
    leaves: new PrismaLeaveRepository(database),
    processedEvents: new PrismaProcessedEventRepository(database),
    initialize: () => checkpointer.setup(),
    close: async (): Promise<void> => {
      const results = await Promise.allSettled([checkpointer.end(), database.$disconnect()]);
      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (failure) throw failure.reason;
    },
  };
}
