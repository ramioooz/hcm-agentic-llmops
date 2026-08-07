import { redactSensitiveData } from '../../src/security/pii-redaction';

describe('redactSensitiveData', () => {
  it('redacts sensitive employee fields while preserving safe operational fields', () => {
    expect(
      redactSensitiveData({
        employeeId: 'EMP-201',
        employeeCode: 'EMP-201',
        actorEmployeeCode: 'EMP-200',
        fullName: 'Samira Noor',
        email: 'samira@example.test',
        salary: 22000,
        status: 'ACTIVE',
      }),
    ).toEqual({
      employeeId: 'EMP-***',
      employeeCode: '[REDACTED]',
      actorEmployeeCode: '[REDACTED]',
      fullName: '[REDACTED]',
      email: '[REDACTED]',
      salary: '[REDACTED]',
      status: 'ACTIVE',
    });
  });
});
