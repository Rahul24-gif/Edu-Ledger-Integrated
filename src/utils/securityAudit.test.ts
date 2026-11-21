import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReportsExcelWorkbook,
  formatSafeCsvCell,
  MAX_IMPORT_STUDENT_ROWS,
  parseSafeCsvRows,
  parseStudentRowsFromRecords,
  parseWorkspaceBackupJSONText,
  sanitizeDownloadFilenamePart,
  sanitizeSpreadsheetCellText,
} from './excelUtils';
import {
  resolveStudentInAcademicYear,
  safeJsonParse,
  sanitizePaymentPayload,
  sanitizeStudentPayload,
} from './ledgerLogic';

test('PoC 1: Spreadsheet formula injection payloads are neutralized in CSV and Excel cell text', () => {
  assert.equal(
    sanitizeSpreadsheetCellText('=CMD|\' /C calc\'!A0'),
    "'=CMD|' /C calc'!A0"
  );
  assert.equal(sanitizeSpreadsheetCellText('+1+1'), "'+1+1");
  assert.equal(sanitizeSpreadsheetCellText('-1+1'), "'-1+1");
  assert.equal(sanitizeSpreadsheetCellText('@SUM(A1:A5)'), "'@SUM(A1:A5)");
  assert.equal(sanitizeSpreadsheetCellText('\t=HYPERLINK("http://evil")'), "'\t=HYPERLINK(\"http://evil\")");
  assert.equal(sanitizeSpreadsheetCellText('   =1+1'), "'   =1+1");

  // Legitimate values and lone '-' date placeholder remain untouched
  assert.equal(sanitizeSpreadsheetCellText('-'), '-');
  assert.equal(sanitizeSpreadsheetCellText('Aarav Rajesh Sharma'), 'Aarav Rajesh Sharma');
  assert.equal(sanitizeSpreadsheetCellText('00013001'), '00013001');

  // CSV cell formatter both neutralizes formulas AND escapes embedded double quotes
  assert.equal(
    formatSafeCsvCell('=HYPERLINK("http://evil.test","Click")'),
    '"\'=HYPERLINK(""http://evil.test"",""Click"")"'
  );
  assert.equal(formatSafeCsvCell(10000), '10000');
});

test('PoC 2: Excel workbook generator neutralizes malicious formula names while preserving legitimate SUM/COUNTIF formulas', async () => {
  const maliciousStudent = sanitizeStudentPayload({
    studentId: 'stu_poc_formula',
    ownerId: 'uid_tester',
    rollNo: '=1+1',
    fullName: '=CMD|\' /C calc\'!A0',
    fatherName: 'Test Father',
    phone: '',
    stream: '+SUM(1,2)',
    centerName: 'Batch 2026-27',
    enrollmentAY: '2026-27',
    progressionAY: '2027-28',
    admissionClass: 'XI',
    classXIFee: 10000,
    classXIIFee: 10000,
    scholarshipDiscount: 0,
    totalIntegratedFee: 20000,
    paidClassXI: 10000,
    paidClassXII: 0,
    totalPaid: 10000,
    xiPaymentDate: '10/06/2026',
    xiiPaymentDate: '-',
    status: 'active',
    remarks: 'Only XI Paid',
  });

  const viewRow = resolveStudentInAcademicYear(maliciousStudent, '2026-27');
  assert.ok(viewRow);

  const wb = await buildReportsExcelWorkbook([viewRow], '2026-27', {
    schoolDisplayName: '=EVIL_SCHOOL()',
  });

  const xiSheet = wb.getWorksheet('Class XI');
  assert.ok(xiSheet);
  assert.ok(String(xiSheet.getCell('A1').value).startsWith("'=EVIL_SCHOOL()"));
  assert.equal(xiSheet.getCell('B5').value, "'=1+1");
  assert.equal(xiSheet.getCell('C5').value, "'=CMD|' /C calc'!A0");
  assert.equal(xiSheet.getCell('F5').value, "'+SUM(1,2)");
  assert.equal(xiSheet.getCell('I5').value, '-');

  // Legitimate calculated total formula on K5 still works
  const k5 = xiSheet.getCell('K5').value as { formula: string; result: number };
  assert.equal(k5.formula, 'H5+J5');
  assert.equal(k5.result, 10000);
});

test('PoC 3: Prototype pollution keys (__proto__, constructor, prototype) are stripped from JSON backups & CSV imports', () => {
  const pollutedJson = JSON.stringify({
    version: 1,
    availableAYs: ['2026-27', 'invalid-ay', '../../etc'],
    feeSettings: {
      schoolDisplayName: 'SciFee\x00College',
      classXIDefaultFee: -5000,
      classXIIDefaultFee: 999999999,
      receiptPrefix: '../../../etc/passwd',
    },
    students: [
      {
        studentId: 'stu_safe_1',
        ownerId: 'owner_1',
        rollNo: '001',
        fullName: 'Safe Student',
        enrollmentAY: '2026-27',
        progressionAY: '2027-28',
        admissionClass: 'XI',
        classXIFee: 10000,
        classXIIFee: 10000,
        scholarshipDiscount: 50000, // exceeds total fee -> must clamp to 20000
        paidClassXI: 10000,
        paidClassXII: 0,
        totalPaid: 999999, // forged totalPaid -> must recompute to 10000
        status: 'active',
      },
      null,
      'corrupt-entry',
    ],
    payments: [
      {
        paymentId: 'pay_1',
        studentId: 'stu_safe_1',
        ownerId: 'owner_1',
        studentName: 'Safe Student',
        rollNo: '001',
        stream: 'Science (Integrated)',
        enrollmentAY: '2026-27',
        progressionAY: '2027-28',
        recordedInAY: '2026-27',
        targetClass: 'XI',
        amount: 0,
        allocatedToXI: 0,
        allocatedToXII: 0,
        paymentDate: '10/06/2026',
        paymentMode: 'CRYPTO_HACK', // invalid enum -> must fallback to 'Cash'
        receiptNo: 'SF-001',
        installmentLabel: 'Fee',
      },
    ],
  }).replace(
    '"version":1,',
    '"version":1,"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"evil":true}},'
  );

  const rawParsed = safeJsonParse<Record<string, unknown>>(pollutedJson);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(({} as Record<string, unknown>).evil, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(rawParsed, '__proto__'), false);

  const backup = parseWorkspaceBackupJSONText(pollutedJson);
  assert.deepEqual(backup.availableAYs, ['2026-27']);
  assert.equal(backup.feeSettings.schoolDisplayName, 'SciFeeCollege');
  assert.equal(backup.feeSettings.classXIDefaultFee, 0);
  assert.equal(backup.feeSettings.classXIIDefaultFee, 10000000);
  assert.equal(backup.feeSettings.receiptPrefix, 'ETCPASSW');

  // Student invariants enforced
  assert.equal(backup.students.length, 1);
  assert.equal(backup.students[0].scholarshipDiscount, 20000);
  assert.equal(backup.students[0].totalIntegratedFee, 0);
  assert.equal(backup.students[0].totalPaid, 10000);

  // Payment invariants & enum enforced
  assert.equal(backup.payments.length, 1);
  assert.equal(backup.payments[0].paymentMode, 'Cash');
  assert.equal(
    backup.payments[0].allocatedToXI + backup.payments[0].allocatedToXII,
    backup.payments[0].amount
  );
  assert.ok(backup.payments[0].amount >= 1);
});

test('PoC 4: Oversized JSON backups and malformed non-string payloads are rejected or safely bounded', () => {
  const oversizedText = 'x'.repeat(5 * 1024 * 1024 + 10);
  assert.throws(
    () => parseWorkspaceBackupJSONText(oversizedText),
    /5 MB safety limit/
  );

  // Non-string types inside Student/Payment objects never throw TypeErrors
  const weirdStudent = sanitizeStudentPayload({
    studentId: 12345 as unknown as string,
    ownerId: null as unknown as string,
    rollNo: {} as unknown as string,
    fullName: ['bad'] as unknown as string,
    classXIFee: -999,
    classXIIFee: 10000,
    paidClassXI: -50,
    paidClassXII: 5000,
  });
  assert.ok(weirdStudent.studentId.startsWith('stu_'));
  assert.equal(weirdStudent.fullName, 'Student');
  assert.equal(weirdStudent.classXIFee, 0);
  assert.equal(weirdStudent.paidClassXI, 0);
  assert.equal(weirdStudent.totalPaid, 5000);

  const weirdPayment = sanitizePaymentPayload({
    paymentId: null as unknown as string,
    studentId: undefined as unknown as string,
    paymentMode: 'INVALID' as unknown as 'Cash',
    allocatedToXI: -100,
    allocatedToXII: 0,
    amount: -500,
  });
  assert.equal(weirdPayment.paymentMode, 'Cash');
  assert.equal(weirdPayment.amount, 1);
  assert.equal(weirdPayment.allocatedToXI + weirdPayment.allocatedToXII, 1);
});

test('PoC 5: Safe linear-time CSV parser handles quoted commas, blocks __proto__ headers, and enforces row cap', () => {
  const csv = [
    'EC No.,Student Name,__proto__,Class XI Paid,Mobile',
    '00013901,"Sharma, Aarav",bad,10000,-',
    '00013902,"Patil ""Jr"" Rohan",bad,5000,9820155102',
  ].join('\r\n');

  const records = parseSafeCsvRows(csv);
  assert.equal(records.length, 2);
  assert.equal(records[0]['Student Name'], 'Sharma, Aarav');
  assert.equal(records[1]['Student Name'], 'Patil "Jr" Rohan');
  assert.equal(Object.prototype.hasOwnProperty.call(records[0], '__proto__'), false);

  const students = parseStudentRowsFromRecords(records, '2026-27', 1);
  assert.equal(students.length, 2);
  assert.equal(students[0].phone, ''); // missing phone not fabricated
  assert.equal(students[0].paidClassXI, 10000);
  assert.equal(students[1].phone, '9820155102');
  assert.ok(students.length <= MAX_IMPORT_STUDENT_ROWS);
});

test('PoC 6: Download filename sanitizer neutralizes path traversal sequences', () => {
  assert.equal(
    sanitizeDownloadFilenamePart('../../etc/passwd'),
    'etc_passwd'
  );
  assert.equal(sanitizeDownloadFilenamePart('2026-27'), '2026-27');
  assert.equal(sanitizeDownloadFilenamePart('///...///', 'Fallback'), 'Fallback');
});
