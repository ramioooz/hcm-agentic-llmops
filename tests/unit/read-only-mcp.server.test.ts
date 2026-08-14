import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createReadOnlyMcpServer } from '../../src/mcp/read-only-mcp.server';
import type { EmployeeRecord } from '../../src/types/employee-record';

describe('read-only MCP server', () => {
  it('exposes only authorized masked read tools with stable errors', async () => {
    const employees = new Map<string, EmployeeRecord>([
      [
        'EMP-200',
        {
          employeeCode: 'EMP-200',
          fullName: 'Manager Example',
          accessRole: 'MANAGER',
          status: 'ACTIVE',
          managerEmployeeCode: null,
          activeReviewPeriod: null,
        },
      ],
      [
        'EMP-201',
        {
          employeeCode: 'EMP-201',
          fullName: 'Direct Report',
          accessRole: 'EMPLOYEE',
          status: 'ACTIVE',
          managerEmployeeCode: 'EMP-200',
          activeReviewPeriod: { endDate: '2026-08-21' },
        },
      ],
      [
        'EMP-300',
        {
          employeeCode: 'EMP-300',
          fullName: 'Unrelated Employee',
          accessRole: 'EMPLOYEE',
          status: 'ACTIVE',
          managerEmployeeCode: null,
          activeReviewPeriod: { endDate: '2026-08-31' },
        },
      ],
    ]);
    const server = createReadOnlyMcpServer({
      actorEmployeeCode: 'EMP-200',
      correlationId: '00000000-0000-4000-8000-000000000042',
      employees: {
        findByEmployeeCode: async (employeeCode) => employees.get(employeeCode) ?? null,
      },
      clock: { today: () => '2026-08-07' },
      knowledgeQueries: {
        query: async () => ({
          status: 'ANSWERED' as const,
          answer: 'The fictional policy allows two remote days.',
          sources: [
            {
              documentId: '00000000-0000-4000-8000-000000000041',
              documentTitle: 'Fictional Policy',
              chunkId: '00000000-0000-4000-8000-000000000001',
              chunkIndex: 0,
              pageNumber: 1,
            },
          ],
        }),
      },
    });
    const client = new Client({ name: 'unit-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const listed = await client.listTools();
    const onboarding = await client.callTool({
      name: 'get_employee_onboarding_status',
      arguments: { targetEmployeeCode: 'EMP-201' },
    });
    const denied = await client.callTool({
      name: 'get_employee_onboarding_status',
      arguments: { targetEmployeeCode: 'EMP-300' },
    });
    const knowledge = await client.callTool({
      name: 'search_knowledge_documents',
      arguments: { query: 'How many remote days?' },
    });

    expect(listed.tools.map((tool) => tool.name)).toEqual([
      'get_employee_onboarding_status',
      'search_knowledge_documents',
    ]);
    expect(listed.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(onboarding).toMatchObject({
      isError: false,
      structuredContent: {
        status: 'COMPLETED',
        employeeCode: 'EMP-***',
        daysRemaining: 14,
        correlationId: '00000000-0000-4000-8000-000000000042',
      },
    });
    expect(denied).toMatchObject({
      isError: true,
      structuredContent: {
        status: 'FAILED',
        code: 'AUTHORIZATION_DENIED',
        message: 'You are not authorized to read that employee onboarding status.',
        correlationId: '00000000-0000-4000-8000-000000000042',
      },
    });
    expect(JSON.stringify(denied)).not.toContain('Unrelated Employee');
    expect(knowledge).toMatchObject({
      isError: false,
      structuredContent: {
        status: 'ANSWERED',
        answer: 'The fictional policy allows two remote days.',
        correlationId: '00000000-0000-4000-8000-000000000042',
      },
    });

    await Promise.all([client.close(), server.close()]);
  });
});
