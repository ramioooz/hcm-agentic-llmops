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
