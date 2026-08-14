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
      employeeCode: 'EMP-***',
      actorEmployeeCode: 'EMP-***',
      fullName: 'S***** N***',
      email: 's*****@example.test',
      salary: '[REDACTED]',
      status: 'ACTIVE',
    });
  });

  it('masks phone, employee code, email, and name fields without retaining their values', () => {
    expect(
      redactSensitiveData({
        phone: '0501234567',
        employeeCode: 'EMP-201',
        email: 'samira@company.com',
        fullName: 'Samira Noor',
      }),
    ).toEqual({
      phone: '05********',
      employeeCode: 'EMP-***',
      email: 's*****@company.com',
      fullName: 'S***** N***',
    });
  });
});
