import { execFileSync } from 'node:child_process';

interface RenderedService {
  build?: {
    target?: string;
  };
  command?: string[];
  depends_on?: Record<string, { condition?: string }>;
  environment?: Record<string, string>;
  restart?: string;
}

interface RenderedComposeConfiguration {
  services: Record<string, RenderedService>;
}

describe('container delivery contract', () => {
  it('runs Prisma migrations in one-shot tooling before starting the runtime-only API', () => {
    const rendered = JSON.parse(
      execFileSync('docker', ['compose', 'config', '--format', 'json'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          COMPOSE_PROJECT_NAME: 'hcm-delivery-contract-test',
          LANGSMITH_API_KEY: '',
          OPENAI_API_KEY: 'unit-test-openai-key',
          WEBHOOK_API_KEY: 'unit-test-webhook-key-at-least-32-characters',
        },
      }),
    ) as RenderedComposeConfiguration;

    expect(rendered.services.api).toMatchObject({
      build: { target: 'runtime' },
      command: ['npm', 'start'],
      depends_on: {
        tooling: { condition: 'service_completed_successfully' },
      },
    });
    const tooling = rendered.services.tooling;
    expect(tooling).toBeDefined();
    if (!tooling) throw new Error('Rendered Compose configuration has no tooling service');
    expect(tooling).toMatchObject({
      build: { target: 'tooling' },
      command: ['npm', 'run', 'db:migrate'],
      restart: 'no',
    });
    expect(tooling.environment?.AMQP_URL).toBe('amqp://guest:guest@rabbitmq:5672');
    expect(tooling.environment?.PORT).toBe('3000');
    expect(tooling.environment?.WEBHOOK_API_KEY).toBe(
      'unit-test-webhook-key-at-least-32-characters',
    );
  });
});
