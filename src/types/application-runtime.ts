export type ApplicationRuntime = {
  start(): Promise<void>;
  stop(): Promise<void>;
};
