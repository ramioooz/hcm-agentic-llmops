import {
  createNotificationStudioGraph,
  createReviewStudioGraph,
} from '../../src/studio/onboarding.studio.graph';

async function executedNodes(graph: ReturnType<typeof createReviewStudioGraph>): Promise<string[]> {
  const nodes: string[] = [];
  const stream = await graph.stream({ ownerBindingId: 'studio-owner' }, { streamMode: 'updates' });
  for await (const update of stream) {
    nodes.push(...Object.keys(update));
  }
  return nodes;
}

describe('LangGraph Studio production export', () => {
  it('exposes the production topology and follows review and notification paths', async () => {
    const reviewGraph = createReviewStudioGraph();
    const topology = reviewGraph.getGraph({ xray: true });
    const nodeNames = Object.keys(topology.nodes);

    expect(nodeNames).toEqual(
      expect.arrayContaining([
        'request_guard',
        'intent_normalization',
        'routing',
        'onboarding:employee_lookup',
        'onboarding:onboarding_calculation',
        'onboarding:manager_notification',
        'response_audit',
      ]),
    );
    expect(nodeNames).not.toContain('onboarding_agent');
    expect(
      topology.edges
        .filter((edge) => edge.source === 'request_guard')
        .map((edge) => edge.target)
        .sort(),
    ).toEqual(['intent_normalization', 'response_audit']);
    expect(
      topology.edges
        .filter((edge) => edge.source === 'routing')
        .map((edge) => edge.target)
        .sort(),
    ).toEqual(['leave:parallel_leave_context', 'onboarding:employee_lookup', 'response_audit']);

    const reviewPath = await executedNodes(reviewGraph);
    const notificationPath = await executedNodes(createNotificationStudioGraph());

    expect(reviewPath).toEqual([
      'request_guard',
      'intent_normalization',
      'routing',
      'onboarding',
      'response_audit',
    ]);
    expect(notificationPath).toEqual([
      'request_guard',
      'intent_normalization',
      'routing',
      'onboarding',
      'response_audit',
    ]);
  });
});
