import { createApp } from './app';
import { loadEnvironment } from './config/load-environment';
import { createDatabaseClient } from './infrastructure/database/prisma';
import { PrismaEmployeeRepository } from './repositories/employee.repository';
import { OnboardingAgentService } from './services/onboarding-agent.service';

const environment = loadEnvironment();
const database = createDatabaseClient();
const onboardingAgent = new OnboardingAgentService({
  employees: new PrismaEmployeeRepository(database),
});
const app = createApp({
  checkDatabase: async () => {
    await database.$queryRaw`SELECT 1`;
  },
  invokeAgent: (input) => onboardingAgent.invoke(input),
});

const server = app.listen(environment.port, () => {
  process.stdout.write(`API listening on port ${environment.port}\n`);
});

async function shutdown(signal: string): Promise<void> {
  process.stdout.write(`Received ${signal}; shutting down\n`);
  server.close(async () => {
    await database.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
