export type KnowledgeSecurityContext = {
  correlationId: string;
  actorEmployeeCode: string;
  requestSource: 'HTTP' | 'MCP';
};
