import pino, { type Logger } from 'pino';
import { redactSensitiveData } from '../security/pii-redaction';
import type { ApplicationLogger } from '../types/application-logger';
import type { OperationalLogEntry } from '../types/operational-log-entry';
import { ragTracingLogMessages } from './rag-tracing-log-messages';

const sensitiveKeys = new Set([
  'cause',
  'error',
  'errorMessage',
  'email',
  'employeeCode',
  'actorEmployeeCode',
  'targetEmployeeCode',
  'fullName',
  'message',
  'name',
  'phone',
  'phoneNumber',
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

function redactEntry(entry: OperationalLogEntry): Record<string, unknown> {
  const redacted = redact(entry) as Record<string, unknown>;
  const safeMessage =
    entry.event === 'knowledge.trace.disabled'
      ? ragTracingLogMessages.disabled
      : entry.event === 'knowledge.trace.skipped'
        ? ragTracingLogMessages.skipped
        : undefined;

  if (safeMessage && entry.message === safeMessage) {
    redacted.message = safeMessage;
  }

  return redacted;
}

export class PinoApplicationLogger implements ApplicationLogger {
  public constructor(private readonly logger: Logger = pino()) {}

  public info(entry: OperationalLogEntry): void {
    this.logger.info(redactEntry(entry));
  }

  public warn(entry: OperationalLogEntry): void {
    this.logger.warn(redactEntry(entry));
  }

  public error(entry: OperationalLogEntry): void {
    this.logger.error(redactEntry(entry));
  }
}
