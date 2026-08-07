const sensitiveKeys = new Set([
  'fullName',
  'email',
  'salary',
  'phone',
  'address',
  'employeeCode',
  'actorEmployeeCode',
]);

function redactValue(key: string, value: unknown): unknown {
  if (sensitiveKeys.has(key)) {
    return '[REDACTED]';
  }

  if (key === 'employeeId' && typeof value === 'string') {
    return value.length > 4 ? `${value.slice(0, 4)}***` : '***';
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
