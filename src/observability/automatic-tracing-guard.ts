const automaticTracingAliases = [
  'LANGSMITH_TRACING',
  'LANGSMITH_TRACING_V2',
  'LANGCHAIN_TRACING',
  'LANGCHAIN_TRACING_V2',
] as const;

export function assertAutomaticTracingDisabled(
  environment: Record<string, string | undefined>,
): void {
  const enabledAlias = automaticTracingAliases.find(
    (alias) => environment[alias]?.trim().toLowerCase() === 'true',
  );
  if (enabledAlias) {
    throw new Error(`Automatic LangChain tracing must remain disabled; unset ${enabledAlias}.`);
  }
}
