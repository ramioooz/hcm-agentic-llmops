import { ApplicationStartupErrorCode } from '../enums/application.enum';

type StartupErrorOptions = {
  includeStack: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readPort(record: Record<string, unknown>): string | undefined {
  const value = record.port;
  const port = typeof value === 'number' || typeof value === 'string' ? String(value) : undefined;
  return port && /^\d{1,5}$/.test(port) && Number(port) <= 65_535 ? port : undefined;
}

function readAddress(record: Record<string, unknown>): string | undefined {
  const address = readString(record, 'address');
  return address && /^[A-Za-z0-9.:[\]-]+$/.test(address) ? address : undefined;
}

function sanitizeErrorText(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+(@)/gi, '$1[REDACTED]$2')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b((?:[A-Z0-9_-]*(?:API_?KEY|TOKEN|PASSWORD|SECRET)[A-Z0-9_-]*)\s*[=:]\s*)[^\s,;]+/gi,
      '$1[REDACTED]',
    )
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/\blsv2_[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
}

function errorCode(record: Record<string, unknown>): string {
  const code = readString(record, 'code') ?? readString(record, 'errorCode');
  return code && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : ApplicationStartupErrorCode.Unknown;
}

function errorMessage(error: unknown, record: Record<string, unknown>): string {
  if (error instanceof Error) return error.message;
  return readString(record, 'message') ?? 'Unknown startup failure.';
}

function formatKnownError(
  code: string,
  record: Record<string, unknown>,
  message: string,
): string | undefined {
  const port = readPort(record);
  const address = readAddress(record);

  switch (code) {
    case ApplicationStartupErrorCode.AddressInUse:
      return (
        `API failed to start [${code}]: port ${port ?? 'configured by PORT'} is already in use.\n` +
        'Fix: stop the existing process or configure a different PORT.'
      );
    case ApplicationStartupErrorCode.PermissionDenied:
      return (
        `API failed to start [${code}]: permission was denied while binding to port ${port ?? 'configured by PORT'}.\n` +
        'Fix: use an unprivileged available port or correct the process permissions.'
      );
    case ApplicationStartupErrorCode.ConnectionRefused: {
      const endpoint = [address, port].filter(Boolean).join(':') || 'a required dependency';
      return (
        `API failed to start [${code}]: connection refused at ${endpoint}.\n` +
        'Fix: start the required dependency and verify its connection URL.'
      );
    }
    case ApplicationStartupErrorCode.DatabaseUnavailable:
      return (
        `API failed to start [${code}]: PostgreSQL is unreachable.\n` +
        'Fix: start PostgreSQL and verify DATABASE_URL.'
      );
    default:
      if (
        message.startsWith('Invalid environment:') ||
        message.startsWith('PORT must be') ||
        message.includes(' is required when ')
      ) {
        return (
          `API failed to start [${ApplicationStartupErrorCode.ConfigurationInvalid}]: ${sanitizeErrorText(message)}\n` +
          'Fix: correct the listed variables in the local .env file.'
        );
      }
      return undefined;
  }
}

export function formatStartupError(error: unknown, options: StartupErrorOptions): string {
  const record = isRecord(error) ? error : {};
  const code = errorCode(record);
  const message = errorMessage(error, record);
  const knownError = formatKnownError(code, record, message);
  if (knownError) return knownError;

  const safeMessage = sanitizeErrorText(message);
  let diagnostic = `API failed to start [${code}]: ${safeMessage}`;

  if (options.includeStack && error instanceof Error && error.stack) {
    const safeStack = sanitizeErrorText(error.stack);
    diagnostic += `\n${safeStack}`;
  }

  return diagnostic;
}
