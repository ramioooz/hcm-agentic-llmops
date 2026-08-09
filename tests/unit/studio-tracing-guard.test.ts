describe('Studio automatic tracing guard', () => {
  afterEach(() => {
    delete process.env.LANGSMITH_TRACING_V2;
    jest.resetModules();
  });

  it('rejects an automatic tracing alias during module initialization', async () => {
    process.env.LANGSMITH_TRACING_V2 = 'true';
    jest.resetModules();

    await expect(import('../../src/studio/onboarding.studio')).rejects.toThrow(
      'Automatic LangChain tracing must remain disabled',
    );
  });
});
