# Functional Application Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized `server.ts` composition and lifecycle logic with focused functional bootstrap modules while preserving every public behavior.

**Architecture:** `composeApplication()` will build core, knowledge, agent, and trigger modules and pass required lifecycle functions to `createApplicationRuntime()`. The runtime will own ordered startup, HTTP listener closure, partial-startup cleanup, and idempotent shutdown; `server.ts` will own only environment loading, process signals, and stable process-level output.

**Tech Stack:** Node.js 22, TypeScript, Express, Prisma, PostgreSQL LangGraph checkpointer, RabbitMQ, OpenAI, LangSmith, Jest.

## Global Constraints

- Work only on branch `refactor/functional-application-bootstrap` and target `release` with the pull request.
- GitHub task #56 is the only task closed by the pull request; do not close Story #3 or any Epic.
- Do not merge into `main`; the repository owner remains the sole merger into `main`.
- Do not add a dependency-injection framework, decorators, reflection, or a new runtime dependency.
- Do not change endpoints, response bodies, headers, environment variables, business rules, database schema, tracing behavior, scheduler policy, or RabbitMQ behavior.
- Keep `app.ts` unchanged.
- Add exactly one new unit-test case for the critical lifecycle failure path.
- Do not add Supertest, integration tests, Testcontainers, or end-to-end tests.
- Keep repository and GitHub wording limited to the project and its engineering behavior.

## File Map

### Create

- `src/bootstrap/application-runtime.ts` — ordered startup, HTTP closure, best-effort cleanup, and idempotent shutdown.
- `src/bootstrap/create-core-dependencies.ts` — Prisma, checkpointer, logger, shared repositories, and core lifecycle.
- `src/bootstrap/create-agent-module.ts` — OpenAI normalizer, optional LangSmith recorder, HCM agent, and agent-owned controllers.
- `src/bootstrap/create-knowledge-module.ts` — disabled or enabled RAG composition and knowledge controller.
- `src/bootstrap/create-trigger-module.ts` — trigger processor, RabbitMQ, scheduler, and trigger controllers.
- `src/bootstrap/compose-application.ts` — construction order, cross-module controller composition, and runtime creation.
- `src/types/application-environment.ts` — exported validated environment contract.
- `src/types/application-runtime.ts` — exported `start()` and `stop()` runtime contract.
- `tests/unit/application-runtime.test.ts` — one critical partial-startup cleanup and idempotency test.

### Modify

- `src/config/environment.ts` — return the shared `ApplicationEnvironment` type instead of a private duplicate.
- `src/server.ts` — retain only process entry-point responsibilities.
- `README.md` — document `src/bootstrap` and the new `server.ts` responsibility.
- `docs/architecture.md` — document composition boundaries and lifecycle order.
- `docs/superpowers/specs/2026-08-10-functional-application-bootstrap-design.md` — preserve the approved lifecycle clarification.

### Unchanged

- `src/app.ts` — Express middleware and controller mounting remain exactly as implemented.
- All controllers, graphs, graph nodes, tools, repositories, services, adapters, database migrations, and public API examples.

---

### Task 1: Add Shared Environment and Runtime Contracts

**Files:**

- Create: `src/types/application-environment.ts`
- Create: `src/types/application-runtime.ts`
- Modify: `src/config/environment.ts`

**Interfaces:**

- Produces: `ApplicationEnvironment`, the exact return type of `parseEnvironment()` and `loadEnvironment()`.
- Produces: `ApplicationRuntime` with `start(): Promise<void>` and `stop(): Promise<void>`.
- Consumes: no new runtime behavior.

- [ ] **Step 1: Mark GitHub task #56 In Progress**

Set native Status to `In Progress` and Delivery Status to `In progress`. Keep Story #3 and Sprint 1 Epic #1 open.

- [ ] **Step 2: Create the environment contract with the existing validated fields**

```ts
export type ApplicationEnvironment = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  amqpUrl: string;
  openAiApiKey: string;
  openAiModel: 'gpt-5.4-mini';
  openAiEmbeddingModel: string;
  ragExternalProcessingEnabled: boolean;
  webhookApiKey: string;
  schedulerEnabled: boolean;
  automationActorEmployeeCode: string;
  rabbitPrefetch: number;
  rabbitMaxAttempts: number;
  langSmithTracing: boolean;
  langSmithApiKey?: string;
  langSmithProject: string;
};
```

- [ ] **Step 3: Create the runtime contract**

```ts
export type ApplicationRuntime = {
  start(): Promise<void>;
  stop(): Promise<void>;
};
```

- [ ] **Step 4: Replace the private environment type**

At the top of `src/config/environment.ts`, add:

```ts
import type { ApplicationEnvironment } from '../types/application-environment';
```

Delete the local `type Environment` declaration and change the function signature to:

```ts
export function parseEnvironment(
  input: Record<string, string | undefined>,
): ApplicationEnvironment {
```

- [ ] **Step 5: Verify configuration behavior remains unchanged**

Run:

```bash
npm test -- tests/unit/environment.test.ts
npm run typecheck
```

Expected: the existing environment tests and type checking pass without assertion changes.

- [ ] **Step 6: Commit the contracts**

```bash
git add src/types/application-environment.ts src/types/application-runtime.ts src/config/environment.ts
git commit -m "refactor: expose bootstrap runtime contracts"
```

---

### Task 2: Build and Test the Functional Runtime Lifecycle

**Files:**

- Create: `src/bootstrap/application-runtime.ts`
- Create: `tests/unit/application-runtime.test.ts`

**Interfaces:**

- Consumes: `ApplicationRuntime` from Task 1.
- Produces: `createApplicationRuntime(dependencies): ApplicationRuntime`.
- Required dependency functions: `initializeCore`, `startTriggers`, `stopScheduling`, `listen`, `closeTriggers`, and `closeCore`.

- [ ] **Step 1: Write the single failing lifecycle test**

Create `tests/unit/application-runtime.test.ts` with one test case:

```ts
import { createApplicationRuntime } from '../../src/bootstrap/application-runtime';

describe('application runtime', () => {
  it('cleans a partial startup once and preserves the startup failure', async () => {
    const order: string[] = [];
    const startupFailure = new Error('RABBITMQ_START_FAILED');
    const runtime = createApplicationRuntime({
      initializeCore: async () => {
        order.push('core.initialize');
      },
      startTriggers: async () => {
        order.push('triggers.start');
        throw startupFailure;
      },
      stopScheduling: () => {
        order.push('scheduler.stop');
      },
      listen: () => {
        throw new Error('HTTP_MUST_NOT_START');
      },
      closeTriggers: async () => {
        order.push('triggers.close');
      },
      closeCore: async () => {
        order.push('core.close');
      },
    });

    await expect(runtime.start()).rejects.toBe(startupFailure);
    await expect(runtime.stop()).resolves.toBeUndefined();
    await expect(runtime.stop()).resolves.toBeUndefined();
    expect(order).toEqual([
      'core.initialize',
      'triggers.start',
      'scheduler.stop',
      'triggers.close',
      'core.close',
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```bash
npm test -- tests/unit/application-runtime.test.ts
```

Expected: FAIL because `src/bootstrap/application-runtime.ts` does not exist.

- [ ] **Step 3: Implement the runtime with required dependencies**

Create `src/bootstrap/application-runtime.ts` with local, non-exported HTTP and dependency contracts:

```ts
import type { ApplicationRuntime } from '../types/application-runtime';

type HttpServer = {
  once(event: 'listening', listener: () => void): HttpServer;
  once(event: 'error', listener: (error: Error) => void): HttpServer;
  close(callback: (error?: Error) => void): void;
};

type ApplicationRuntimeDependencies = {
  initializeCore(): Promise<void>;
  startTriggers(): Promise<void>;
  stopScheduling(): void;
  listen(): HttpServer;
  closeTriggers(): Promise<void>;
  closeCore(): Promise<void>;
};
```

Implement these behaviors in `createApplicationRuntime()`:

```ts
export function createApplicationRuntime(
  dependencies: ApplicationRuntimeDependencies,
): ApplicationRuntime {
  let httpServer: HttpServer | undefined;
  let stopPromise: Promise<void> | undefined;

  const closeHttp = async (): Promise<void> => {
    if (!httpServer) return;
    const server = httpServer;
    httpServer = undefined;
    await new Promise<void>((resolve, reject) => {
      server.close((error) =>
        error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
          ? reject(error)
          : resolve(),
      );
    });
  };

  const cleanup = async (): Promise<void> => {
    const failures: unknown[] = [];
    try {
      dependencies.stopScheduling();
    } catch (error) {
      failures.push(error);
    }
    for (const close of [closeHttp, dependencies.closeTriggers, dependencies.closeCore]) {
      try {
        await close();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw failures[0];
  };

  const stop = (): Promise<void> => {
    stopPromise ??= cleanup();
    return stopPromise;
  };

  return {
    start: async () => {
      try {
        await dependencies.initializeCore();
        await dependencies.startTriggers();
        httpServer = dependencies.listen();
        await new Promise<void>((resolve, reject) => {
          httpServer!.once('listening', resolve);
          httpServer!.once('error', reject);
        });
      } catch (error) {
        await stop().catch(() => undefined);
        throw error;
      }
    },
    stop,
  };
}
```

The implementation may extract private functions for readability, but it must not export a generic lifecycle abstraction or accept optional test-only dependencies.

- [ ] **Step 4: Run the focused test and type checking**

Run:

```bash
npm test -- tests/unit/application-runtime.test.ts
npm run typecheck
```

Expected: the one lifecycle test passes and TypeScript accepts the required dependency contract.

- [ ] **Step 5: Commit the runtime**

```bash
git add src/bootstrap/application-runtime.ts tests/unit/application-runtime.test.ts
git commit -m "refactor: add application runtime lifecycle"
```

---

### Task 3: Extract Core and Knowledge Composition

**Files:**

- Create: `src/bootstrap/create-core-dependencies.ts`
- Create: `src/bootstrap/create-knowledge-module.ts`

**Interfaces:**

- Consumes: `ApplicationEnvironment` from Task 1.
- Produces from core: `database`, `checkpointer`, `logger`, `employees`, `runs`, `leaves`, `processedEvents`, `initialize()`, and `close()`.
- Produces from knowledge: `controller` and `queries`, where `queries` is `KnowledgeQueryService | undefined`.

- [ ] **Step 1: Create the shared core dependency factory**

Move the corresponding construction statements from `src/server.ts` into `createCoreDependencies(environment)`:

```ts
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
```

Do not move `checkpointer.setup()` into the factory body; the runtime must retain startup control.

- [ ] **Step 2: Create the knowledge module factory**

Use explicit inputs and retain the current disabled behavior:

```ts
export function createKnowledgeModule(input: {
  environment: ApplicationEnvironment;
  database: PrismaClient;
  employees: PrismaEmployeeRepository;
  runs: PrismaAgentRunRepository;
  logger: PinoApplicationLogger;
}): {
  controller: KnowledgeController;
  queries: KnowledgeQueryService | undefined;
} {
  const security = new KnowledgeSecurityService({ recorder: input.runs, logger: input.logger });
  if (!input.environment.ragExternalProcessingEnabled) {
    return {
      controller: new KnowledgeController({ employees: input.employees, enabled: false }),
      queries: undefined,
    };
  }
```

For the enabled branch, move the current `PrismaKnowledgeRepository`, `OpenAiKnowledgeEmbeddings`, `OpenAiGroundedKnowledgeAnswers`, `KnowledgeQueryService`, `KnowledgeIngestionService`, and enabled `KnowledgeController` composition unchanged. Return the shared query service as `queries`.

- [ ] **Step 3: Run type checking without changing `server.ts` yet**

Run:

```bash
npm run typecheck
```

Expected: the new factories compile even though the original composition remains temporarily in `server.ts`.

- [ ] **Step 4: Commit the core and knowledge factories**

```bash
git add src/bootstrap/create-core-dependencies.ts src/bootstrap/create-knowledge-module.ts
git commit -m "refactor: extract core and knowledge composition"
```

---

### Task 4: Extract Agent and Trigger Composition

**Files:**

- Create: `src/bootstrap/create-agent-module.ts`
- Create: `src/bootstrap/create-trigger-module.ts`

**Interfaces:**

- Consumes: the concrete core dependencies from Task 3 and `ApplicationEnvironment` from Task 1.
- Produces from agent: `agentController`, `leaveRequestController`, and `agent`.
- Produces from triggers: `controllers`, `start()`, `stopScheduling()`, and `close()`.

- [ ] **Step 1: Create the agent module factory**

Move the existing agent composition without changing its options:

```ts
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
```

Do not add optional factories, alternative models, or test-only constructor parameters.

- [ ] **Step 2: Create the trigger module factory**

Compose the existing processor, broker, schedule, and controllers:

```ts
export function createTriggerModule(input: {
  environment: ApplicationEnvironment;
  employees: PrismaEmployeeRepository;
  processedEvents: PrismaProcessedEventRepository;
  agent: AgentInvoker;
}) {
  const processor = new OnboardingTriggerProcessor({
    events: input.processedEvents,
    agent: input.agent,
    automationActorEmployeeCode: input.environment.automationActorEmployeeCode,
  });
  const broker = new RabbitMqOnboardingTransport({
    amqpUrl: input.environment.amqpUrl,
    connector: new AmqplibConnector(),
    processor,
    prefetch: input.environment.rabbitPrefetch,
    maxAttempts: input.environment.rabbitMaxAttempts,
  });
  const schedule = new OnboardingScheduleTrigger({
    enabled: input.environment.schedulerEnabled,
    scheduler: new NodeCronScheduler(),
    candidates: input.employees,
    processor,
    clock: { now: () => new Date() },
  });

  return {
    controllers: createTriggerControllers({
      nodeEnv: input.environment.nodeEnv,
      processor,
      webhookApiKey: input.environment.webhookApiKey,
      publisher: broker,
    }),
    start: async (): Promise<void> => {
      await broker.start();
      schedule.start();
    },
    stopScheduling: (): void => schedule.stop(),
    close: (): Promise<void> => broker.close(),
  };
}
```

`start()` must not catch or remap failures. `application-runtime.ts` owns cleanup and preserves the original startup error.

- [ ] **Step 3: Run type checking**

Run:

```bash
npm run typecheck
```

Expected: both factories compile with the existing concrete adapters and interfaces.

- [ ] **Step 4: Commit the domain bootstrap factories**

```bash
git add src/bootstrap/create-agent-module.ts src/bootstrap/create-trigger-module.ts
git commit -m "refactor: extract agent and trigger composition"
```

---

### Task 5: Compose the Application and Reduce `server.ts`

**Files:**

- Create: `src/bootstrap/compose-application.ts`
- Modify: `src/server.ts`

**Interfaces:**

- Consumes: all factories from Tasks 2–4 and the unchanged `createApp()`.
- Produces: `composeApplication(environment: ApplicationEnvironment): ApplicationRuntime`.
- `server.ts` consumes only `loadEnvironment()`, `composeApplication()`, and the runtime contract returned by composition.

- [ ] **Step 1: Implement the application composition function**

Create modules in the approved order and bridge the shared health and MCP controllers:

```ts
export function composeApplication(environment: ApplicationEnvironment): ApplicationRuntime {
  const core = createCoreDependencies(environment);
  const knowledge = createKnowledgeModule({
    environment,
    database: core.database,
    employees: core.employees,
    runs: core.runs,
    logger: core.logger,
  });
  const agent = createAgentModule({
    environment,
    employees: core.employees,
    runs: core.runs,
    leaves: core.leaves,
    logger: core.logger,
    checkpointer: core.checkpointer,
  });
  const triggers = createTriggerModule({
    environment,
    employees: core.employees,
    processedEvents: core.processedEvents,
    agent: agent.agent,
  });
  const healthController = new HealthController(async () => {
    await core.database.$queryRaw`SELECT 1`;
  });
  const mcpController = new McpController({
    employees: core.employees,
    clock: { today: todayAsDateOnly },
    knowledgeQueries: knowledge.queries,
    logger: core.logger,
  });
  const app = createApp([
    healthController,
    agent.agentController,
    agent.leaveRequestController,
    knowledge.controller,
    mcpController,
    ...triggers.controllers,
  ]);

  return createApplicationRuntime({
    initializeCore: core.initialize,
    startTriggers: triggers.start,
    stopScheduling: triggers.stopScheduling,
    listen: () => app.listen(environment.port),
    closeTriggers: triggers.close,
    closeCore: core.close,
  });
}
```

The controller order must match the existing `server.ts` order.

- [ ] **Step 2: Replace `server.ts` with the process entry point**

The rewritten file must import only the environment loader and application composer:

```ts
import { composeApplication } from './bootstrap/compose-application';
import { loadEnvironment } from './config/load-environment';

async function startServer(): Promise<void> {
  const environment = loadEnvironment();
  const runtime = composeApplication(environment);
  await runtime.start();
  process.stdout.write(`API listening on port ${environment.port}\n`);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`Received ${signal}; shutting down\n`);
    void runtime.stop().catch(() => {
      process.stderr.write('API failed to shut down cleanly.\n');
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

void startServer().catch(() => {
  process.stderr.write('API failed to start.\n');
  process.exitCode = 1;
});
```

Do not call `process.exit()` from resource cleanup. Once all handles close, Node exits naturally.

- [ ] **Step 3: Run focused and full regression tests**

Run:

```bash
npm test -- tests/unit/application-runtime.test.ts tests/unit/controllers.test.ts
npm test
npm run typecheck
```

Expected: one new lifecycle test and all existing suites pass without public-contract assertion changes.

- [ ] **Step 4: Run formatting and linting before committing**

Run:

```bash
npm run lint
npm run format:check
```

If formatting fails, run `npm run format`, inspect the affected files, then repeat both checks.

- [ ] **Step 5: Commit the active composition path**

```bash
git add src/bootstrap/compose-application.ts src/server.ts
git commit -m "refactor: compose application through bootstrap modules"
```

---

### Task 6: Update Architecture Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**

- Consumes: the completed bootstrap structure from Tasks 1–5.
- Produces: accurate public documentation; no source-code interface.

- [ ] **Step 1: Update the README architecture explanation**

Replace the statement that `server.ts` creates every dependency with this ownership model:

```text
server.ts is the process entry point. It loads validated configuration, starts the composed runtime, and handles shutdown signals. The bootstrap directory is the composition boundary: focused factories create shared infrastructure, agent, knowledge, and trigger modules, while application-runtime.ts owns ordered startup and graceful cleanup.
```

Update the repository tree to include:

```text
├── bootstrap/        Functional dependency composition and runtime lifecycle
...
└── server.ts         Process entry point and signal handling
```

- [ ] **Step 2: Update `docs/architecture.md`**

Document this dependency direction:

```text
server.ts
→ compose-application.ts
→ core, knowledge, agent, and trigger factories
→ controllers and application services
```

Document the startup order:

```text
checkpointer setup → RabbitMQ → scheduler → HTTP listener
```

Document the shutdown order:

```text
scheduler stop → HTTP listener close → RabbitMQ close → checkpointer end and Prisma disconnect
```

State explicitly that bootstrap modules contain composition and lifecycle only, never business rules.

- [ ] **Step 3: Verify documentation and source formatting**

Run:

```bash
npm run format:check
rg -n "server.ts is the composition root|server.ts.*creates.*database|server.ts.*creates.*repositories" README.md docs/architecture.md
```

Expected: formatting passes, and the search returns no outdated ownership claim.

- [ ] **Step 4: Commit the documentation**

```bash
git add README.md docs/architecture.md docs/superpowers/specs/2026-08-10-functional-application-bootstrap-design.md docs/superpowers/plans/2026-08-10-functional-application-bootstrap.md
git commit -m "docs: explain functional application bootstrap"
```

---

### Task 7: Complete Verification and Open the Pull Request

**Files:**

- Verify: all files changed by Tasks 1–6.
- GitHub: task #56 and the pull request targeting `release`.

**Interfaces:**

- Produces: a ready-for-review pull request that closes only #56.

- [ ] **Step 1: Generate the Prisma client and run the complete quality suite**

Run in this exact order:

```bash
npm run db:generate
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Expected: every command exits successfully; Jest reports the existing suites plus one new lifecycle test.

- [ ] **Step 2: Inspect the complete branch diff**

Run:

```bash
git diff --check origin/release...HEAD
git diff --stat origin/release...HEAD
git diff origin/release...HEAD -- src/server.ts src/bootstrap src/types/application-environment.ts src/types/application-runtime.ts tests/unit/application-runtime.test.ts README.md docs/architecture.md
```

Confirm:

- No business logic moved into bootstrap.
- `app.ts` and public contracts are unchanged.
- No new package or migration exists.
- No unrelated file is included.
- Repository content contains no prohibited attribution or employment wording.

- [ ] **Step 3: Perform one manual lifecycle verification**

With PostgreSQL and RabbitMQ already available:

```bash
npm run dev
```

In a second terminal, verify:

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/ready
curl --request POST \
  --url http://localhost:3000/api/v1/agent/invoke \
  --header 'Content-Type: application/json' \
  --header 'X-Employee-Id: EMP-200' \
  --data '{"query":"Review EMP-201 onboarding status"}'
```

Press `Ctrl+C` once. Confirm the process prints the shutdown message and exits without leaving the API port open.

- [ ] **Step 4: Push and open a ready-for-review pull request**

```bash
git push -u origin refactor/functional-application-bootstrap
```

Open the pull request against `release` with title:

```text
refactor: extract functional application bootstrap
```

The body must summarize module boundaries, lifecycle ordering, the one critical test, documentation updates, and the completed quality suite. End with:

```text
Closes #56
```

Do not include `Closes #3`, any Epic number, or any instruction about who may merge.

- [ ] **Step 5: Leave the pull request unmerged for repository-owner review**

Confirm the PR targets `release`, is ready for review, and has no merge conflicts. Do not merge it into `release` or `main` during this plan unless the repository owner gives a separate explicit instruction.
