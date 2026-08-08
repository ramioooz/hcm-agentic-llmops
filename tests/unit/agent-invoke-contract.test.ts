import { parseAgentInvokeRequest } from '../../src/contracts/agent-invoke';

describe('agent invocation contract', () => {
  it('accepts a non-empty query and trims it', () => {
    expect(parseAgentInvokeRequest({ query: '  Review EMP-201 onboarding status  ' })).toEqual({
      query: 'Review EMP-201 onboarding status',
    });
  });

  it('rejects an empty query', () => {
    expect(() => parseAgentInvokeRequest({ query: '  ' })).toThrow(
      'query must be a non-empty string',
    );
  });
});
