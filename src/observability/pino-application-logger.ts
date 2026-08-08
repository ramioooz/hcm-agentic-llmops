import pino, { type Logger } from 'pino';
import { redactSensitiveData } from '../security/pii-redaction';
import type { ApplicationLogger } from '../types/application-logger';
import type { OperationalLogEntry } from '../types/operational-log-entry';

const sensitiveKeys = new Set([
  'cause',
  'error',
  'errorMessage',
  'message',
  'name',
  'query',
  'stack',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redact(value: unknown, key?: string): unknown {
  if (key === 'employeeId') {
    return '[REDACTED]';
  }

  if (key && sensitiveKeys.has(key)) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (isRecord(value)) {
    const redactedRecord = redactSensitiveData(value);
    return Object.fromEntries(
      Object.entries(redactedRecord).map(([entryKey, entryValue]) => [
        entryKey,
        redact(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

export class PinoApplicationLogger implements ApplicationLogger {
  public constructor(private readonly logger: Logger = pino()) {}

  public info(entry: OperationalLogEntry): void {
    this.logger.info(redact(entry) as Record<string, unknown>);
  }

  public warn(entry: OperationalLogEntry): void {
    this.logger.warn(redact(entry) as Record<string, unknown>);
  }

  public error(entry: OperationalLogEntry): void {
    this.logger.error(redact(entry) as Record<string, unknown>);
  }
}
