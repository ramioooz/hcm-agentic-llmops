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
