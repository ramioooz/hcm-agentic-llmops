const sensitiveKeys = new Set(['salary', 'address']);

const employeeCodeKeys = new Set([
  'employeeCode',
  'targetEmployeeCode',
  'actorEmployeeCode',
  'employeeId',
]);

function maskEmployeeCode(value: string): string {
  const separator = value.indexOf('-');
  return separator > 0 ? `${value.slice(0, separator + 1)}***` : '***';
}

function maskEmail(value: string): string {
  const separator = value.indexOf('@');
  if (separator <= 0) return '[REDACTED]';
  return `${value[0]}${'*'.repeat(Math.max(1, separator - 1))}${value.slice(separator)}`;
}

function maskName(value: string): string {
  return value
    .split(/(\s+)/)
    .map((part) =>
      /^\s+$/.test(part) || part.length === 0
        ? part
        : `${part[0]}${'*'.repeat(Math.max(1, part.length - 1))}`,
    )
    .join('');
}

function maskPhone(value: string): string {
  return value.length > 2 ? `${value.slice(0, 2)}${'*'.repeat(value.length - 2)}` : '**';
}

function redactValue(key: string, value: unknown): unknown {
  if (sensitiveKeys.has(key)) {
    return '[REDACTED]';
  }

  if (employeeCodeKeys.has(key)) {
    return typeof value === 'string' ? maskEmployeeCode(value) : '[REDACTED]';
  }

  if (key === 'email') {
    return typeof value === 'string' ? maskEmail(value) : '[REDACTED]';
  }

  if (key === 'fullName' || key === 'name') {
    return typeof value === 'string' ? maskName(value) : '[REDACTED]';
  }

  if (key === 'phone' || key === 'phoneNumber') {
    return typeof value === 'string' ? maskPhone(value) : '[REDACTED]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => (isRecord(item) ? redactRecord(item) : item));
  }

  return isRecord(value) ? redactRecord(value) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactValue(key, item)]),
  );
}

export function redactSensitiveData(value: Record<string, unknown>): Record<string, unknown> {
  return redactRecord(value);
}
