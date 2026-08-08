import type { OperationalLogEntry } from './operational-log-entry';

export interface ApplicationLogger {
  info(entry: OperationalLogEntry): void;
  warn(entry: OperationalLogEntry): void;
  error(entry: OperationalLogEntry): void;
}
