function escapePdfText(value: string): string {
  return value.replace(/([\\()])/g, '\\$1');
}

export function generateLeaveRequestPdf(input: {
  leaveRequestId: string;
  employeeCode: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  requestedWorkingDays: number;
}): Buffer {
  const lines = [
    'Annual Leave Request',
    `Request ID: ${input.leaveRequestId}`,
    `Employee: ${input.employeeCode}`,
    `Leave type: ${input.leaveType}`,
    `Start date: ${input.startDate}`,
    `End date: ${input.endDate}`,
    `Working days: ${input.requestedWorkingDays}`,
    'Status: SUBMITTED',
  ];
  const commands = [
    'BT',
    '/F1 18 Tf',
    '72 742 Td',
    `(${escapePdfText(lines[0] as string)}) Tj`,
    '/F1 11 Tf',
    ...lines.slice(1).flatMap((line) => ['0 -28 Td', `(${escapePdfText(line)}) Tj`]),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document, 'ascii'));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
    .join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document, 'ascii');
}
