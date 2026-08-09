import { randomUUID } from 'node:crypto';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveSafeCorrelationId(
  value: string | undefined,
  excludedIds: readonly string[] = [],
): string {
  const candidate = value?.trim();
  const excluded = new Set(excludedIds.map((identifier) => identifier.toLowerCase()));
  let resolved = candidate && UUID_V4_PATTERN.test(candidate) ? candidate : randomUUID();
  while (excluded.has(resolved.toLowerCase())) resolved = randomUUID();
  return resolved;
}
