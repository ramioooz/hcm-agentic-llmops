import { randomUUID } from 'node:crypto';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidThreadIdError extends Error {
  public constructor() {
    super('X-Thread-Id must be a UUID v4.');
  }
}

export function resolveThreadId(value: string | undefined): string {
  if (value === undefined) return randomUUID();

  const candidate = value.trim();
  if (!UUID_V4_PATTERN.test(candidate)) throw new InvalidThreadIdError();

  return candidate;
}
