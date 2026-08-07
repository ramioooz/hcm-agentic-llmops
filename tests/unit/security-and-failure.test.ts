import { mapWorkflowFailure } from '../../src/contracts/failure-mapping';
import { assertEmployeeReadAccess } from '../../src/security/authorization';

describe('security and failure mapping', () => {
  it('denies an employee from reading another employee record', () => {
    expect(() =>
      assertEmployeeReadAccess({
        actorRole: 'EMPLOYEE',
        actorEmployeeId: 'EMP-201',
        targetEmployeeId: 'EMP-202',
      }),
    ).toThrow('AUTHORIZATION_DENIED');
  });

  it('maps known failures to a stable structured response', () => {
    expect(mapWorkflowFailure(new Error('AUTHORIZATION_DENIED'))).toEqual({
      status: 'FAILED',
      code: 'AUTHORIZATION_DENIED',
      message: 'You are not authorized to perform this operation.',
    });

    expect(mapWorkflowFailure(new Error('employeeId is required'))).toEqual({
      status: 'FAILED',
      code: 'VALIDATION_ERROR',
      message: 'employeeId is required',
    });
  });
});
