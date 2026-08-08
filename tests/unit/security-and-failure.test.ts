import { assertEmployeeReadAccess } from '../../src/security/authorization';

describe('authorization', () => {
  it('denies an employee from reading another employee record', () => {
    expect(() =>
      assertEmployeeReadAccess({
        actorRole: 'EMPLOYEE',
        actorEmployeeId: 'EMP-201',
        targetEmployeeId: 'EMP-202',
      }),
    ).toThrow('AUTHORIZATION_DENIED');
  });
});
