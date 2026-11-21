import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCashbook,
  aggregateCollectionByPeriod,
  buildDefaultHeaderConfig,
  buildOpeningPaymentsForStudent,
  calculatePaymentAllocation,
  computeDynamicRegisterCategory,
  computeNetYearFees,
  createInitialSeedData,
  generateNextReceiptNo,
  getClassHeadDisplayName,
  getEditablePhone,
  getNextAcademicYear,
  getPreviousAcademicYear,
  getStatusDisplayLabel,
  getYear2AdvancePaymentInfo,
  isClassXIIDueInAY,
  isPlaceholderPhone,
  parseRegisterDateToISO,
  reconcileImportedStudents,
  resolveStudentInAcademicYear,
  sanitizeStudentPayload,
  updateBatchHeadWithCascade,
} from './ledgerLogic';

test('Academic Year progression helpers advance and reverse consecutively', () => {
  assert.equal(getNextAcademicYear('2025-26'), '2026-27');
  assert.equal(getNextAcademicYear('2026-27'), '2027-28');
  assert.equal(getPreviousAcademicYear('2026-27'), '2025-26');
  assert.equal(getPreviousAcademicYear('2027-28'), '2026-27');
});

test('Real 143-student register totals match user Excel workbook exactly', () => {
  const { students, payments } = createInitialSeedData('test_owner');
  assert.equal(students.length, 143);

  const batch25 = students.filter((s) => s.enrollmentAY === '2025-26');
  const batch26 = students.filter((s) => s.enrollmentAY === '2026-27');
  assert.equal(batch25.length, 60);
  assert.equal(batch26.length, 83);

  const xiSum = students.reduce((acc, s) => acc + s.paidClassXI, 0);
  const xiiSum = students.reduce((acc, s) => acc + s.paidClassXII, 0);
  const totalSum = students.reduce((acc, s) => acc + s.totalPaid, 0);

  assert.equal(xiSum, 1255000);
  assert.equal(xiiSum, 340000);
  assert.equal(totalSum, 1595000);
  assert.ok(payments.length > 100);
});

test('Cross-year Class XI to Class XII automatic promotion works across Academic Years', () => {
  const { students } = createInitialSeedData('test_owner');
  const batch25Student = students.find(
    (s) => s.enrollmentAY === '2025-26' && s.admissionClass === 'XI'
  );
  assert.ok(batch25Student);

  const view25 = resolveStudentInAcademicYear(batch25Student, '2025-26');
  assert.ok(view25);
  assert.equal(view25.activeClassInSelectedAY, 'XI');
  assert.equal(view25.isPromotedFromPreviousAY, false);

  const view26 = resolveStudentInAcademicYear(batch25Student, '2026-27');
  assert.ok(view26);
  assert.equal(view26.activeClassInSelectedAY, 'XII');
  assert.equal(view26.isPromotedFromPreviousAY, true);

  const view27 = resolveStudentInAcademicYear(batch25Student, '2027-28');
  assert.equal(view27, null);
});

test('Dynamic future-year rollover automatically marks Batch 2026-27 as XII Pending in 2027-28', () => {
  const { students } = createInitialSeedData('test_owner');
  const batch26OnlyXI = students.find(
    (s) => s.enrollmentAY === '2026-27' && s.paidClassXI === 10000 && s.paidClassXII === 0
  );
  assert.ok(batch26OnlyXI);

  // In 2026-27 -> Class XII is upcoming -> Only XI Paid
  assert.equal(isClassXIIDueInAY(batch26OnlyXI, '2026-27'), false);
  assert.equal(computeDynamicRegisterCategory(batch26OnlyXI, '2026-27'), 'Only XI Paid');

  // In 2027-28 -> Promoted to Class XII -> XII Pending!
  assert.equal(isClassXIIDueInAY(batch26OnlyXI, '2027-28'), true);
  assert.equal(computeDynamicRegisterCategory(batch26OnlyXI, '2027-28'), 'XII Pending');

  const view27 = resolveStudentInAcademicYear(batch26OnlyXI, '2027-28');
  assert.ok(view27);
  assert.equal(view27.activeClassInSelectedAY, 'XII');
  assert.equal(view27.registerCategory, 'XII Pending');
});

test('Recording Class XII fee dynamically transitions XII Pending student to Full Paid', () => {
  const { students } = createInitialSeedData('test_owner');
  const pendingXIIStudent = students.find(
    (s) =>
      s.enrollmentAY === '2025-26' &&
      computeDynamicRegisterCategory(s, '2026-27') === 'XII Pending'
  );
  assert.ok(pendingXIIStudent);

  const alloc = calculatePaymentAllocation(pendingXIIStudent, 10000, 'XII');
  assert.equal(alloc.allocatedToXI, 0);
  assert.equal(alloc.allocatedToXII, 10000);
  assert.equal(alloc.newTotalPaid, 20000);

  const updated = {
    ...pendingXIIStudent,
    paidClassXI: alloc.newPaidClassXI,
    paidClassXII: alloc.newPaidClassXII,
    totalPaid: alloc.newTotalPaid,
  };
  assert.equal(computeDynamicRegisterCategory(updated, '2026-27'), 'Full Paid');
});

test('Scholarship discount splits cleanly across Class XI and Class XII fees', () => {
  const res = computeNetYearFees(10000, 10000, 2000);
  assert.equal(res.netClassXIFee, 9000);
  assert.equal(res.netClassXIIFee, 9000);
  assert.equal(res.totalIntegratedFee, 18000);
});

test('Placeholder phone hygiene detects synthetic seeded numbers and preserves real numbers', () => {
  assert.equal(isPlaceholderPhone('9820110001'), true);
  assert.equal(isPlaceholderPhone('9820110143'), true);
  assert.equal(isPlaceholderPhone(''), true);
  assert.equal(isPlaceholderPhone('9876543210'), false);
  assert.equal(getEditablePhone('9820110005'), '');
  assert.equal(getEditablePhone('9876543210'), '9876543210');
});

test('Sequential receipt numbers increment cleanly per academic year', () => {
  const { payments } = createInitialSeedData('test_owner');
  const first = generateNextReceiptNo(payments, '2026-27', 'SF');
  assert.ok(first.startsWith('SF/2026-27/'));

  const withOne = [
    ...payments,
    { ...payments[0], paymentId: 'p_seq', receiptNo: 'SF/2026-27/0500' },
  ];
  assert.equal(generateNextReceiptNo(withOne, '2026-27', 'SF'), 'SF/2026-27/0501');
});

test('Cashbook aggregator separates tuition, fine, payment modes, and reversed receipts', () => {
  const { payments } = createInitialSeedData('test_owner');
  const sample = [
    {
      ...payments[0],
      paymentId: 'p1',
      paymentDate: '15/06/2026',
      paymentMode: 'UPI' as const,
      amount: 10000,
      fineAmount: 250,
      receiptStatus: 'active' as const,
    },
    {
      ...payments[0],
      paymentId: 'p2',
      paymentDate: '16/06/2026',
      paymentMode: 'Cash' as const,
      amount: 5000,
      fineAmount: 0,
      receiptStatus: 'active' as const,
    },
    {
      ...payments[0],
      paymentId: 'p3',
      paymentDate: '16/06/2026',
      paymentMode: 'Cash' as const,
      amount: 10000,
      fineAmount: 100,
      receiptStatus: 'reversed' as const,
    },
  ];

  assert.equal(parseRegisterDateToISO('15/06/2026'), '2026-06-15');
  assert.equal(parseRegisterDateToISO('May 2025'), '2025-05-01');

  const summary = aggregateCashbook(sample, '2026-06-01', '2026-06-30', 'ALL');
  assert.equal(summary.activeCount, 2);
  assert.equal(summary.reversedCount, 1);
  assert.equal(summary.tuitionTotal, 15000);
  assert.equal(summary.fineTotal, 250);
  assert.equal(summary.grandTotal, 15250);

  const upiRow = summary.byMode.find((m) => m.mode === 'UPI');
  const cashRow = summary.byMode.find((m) => m.mode === 'Cash');
  assert.equal(upiRow?.grandTotal, 10250);
  assert.equal(cashRow?.grandTotal, 5000);
});

test('Duplicate-safe Excel reconciliation classifies EC matches, name matches, and new students', () => {
  const { students } = createInitialSeedData('test_owner');
  const existingFirst = students[0];

  const conflicts = reconcileImportedStudents(
    [
      { ...existingFirst, studentId: 'imp_1', phone: '' },
      { ...existingFirst, studentId: 'imp_2', rollNo: 'CUSTOM-999', phone: '9876543210' },
      {
        ...existingFirst,
        studentId: 'imp_3',
        rollNo: 'CUSTOM-1000',
        fullName: 'Brand New Student',
        phone: '',
      },
    ],
    students
  );

  assert.equal(conflicts[0].matchType, 'duplicate_ec');
  assert.equal(conflicts[0].missingPhone, true);
  assert.equal(conflicts[1].matchType, 'duplicate_name');
  assert.equal(conflicts[1].missingPhone, false);
  assert.equal(conflicts[2].matchType, 'new');
  assert.equal(conflicts[2].missingPhone, true);
});

test('Sanitizing Admission Cancelled student zeros unpaid balances and sets status dropped', () => {
  const { students } = createInitialSeedData('test_owner');
  const cancelled = sanitizeStudentPayload({
    ...students[0],
    paidClassXI: 0,
    paidClassXII: 0,
    totalPaid: 0,
    remarks: 'Admission Cancelled',
  });
  assert.equal(cancelled.status, 'dropped');
  assert.equal(cancelled.totalIntegratedFee, 0);
  assert.equal(cancelled.remarks, 'Admission Cancelled');
});

test('Opening payment generator creates receipts for pre-paid imported students', () => {
  const { students, payments } = createInitialSeedData('test_owner');
  const opening = buildOpeningPaymentsForStudent(
    { ...students[0], studentId: 'stu_new_999', paidClassXI: 10000, paidClassXII: 0 },
    payments,
    'SF'
  );
  assert.equal(opening.length, 1);
  assert.equal(opening[0].targetClass, 'XI');
  assert.equal(opening[0].amount, 10000);
  assert.equal(opening[0].receiptStatus, 'active');
});

test('Targeted Class XII payment on already-paid student stays allocated to Class XII', () => {
  const { students } = createInitialSeedData('test_owner');
  const fullPaid = {
    ...students[0],
    classXIFee: 10000,
    classXIIFee: 10000,
    scholarshipDiscount: 0,
    paidClassXI: 10000,
    paidClassXII: 10000,
    totalPaid: 20000,
  };
  const alloc = calculatePaymentAllocation(fullPaid, 10000, 'XII');
  assert.equal(alloc.allocatedToXI, 0);
  assert.equal(alloc.allocatedToXII, 10000);
});

test('Centralized batch head rename updates display labels and cascades Academic Year across students & payments', () => {
  const { students, payments } = createInitialSeedData('test_owner');
  const availableAYs = ['2025-26', '2026-27', '2027-28'];
  const headerConfig = buildDefaultHeaderConfig(availableAYs);
  const batch25 = headerConfig.batchHeads.find(
    (b) => b.enrollmentAY === '2025-26'
  );
  assert.ok(batch25);

  const res = updateBatchHeadWithCascade({
    headerConfig,
    students,
    payments,
    availableAYs,
    batchId: batch25.id,
    nextEnrollmentAY: '2027-28',
    nextBatchTitle: 'Batch 2027-28',
    nextClassXIHeadName: 'Class XI - Batch 2027-28',
    nextClassXIIHeadName: 'Class XII - Batch 2027-28',
  });

  assert.equal(
    getClassHeadDisplayName(res.nextHeaderConfig, '2027-28', 'XII'),
    'Class XII - Batch 2027-28'
  );
  assert.equal(res.updatedStudents.length, 60);
  assert.ok(res.updatedStudents.every((s) => s.enrollmentAY === '2027-28'));
  assert.ok(res.updatedStudents.every((s) => s.progressionAY === '2028-29'));
  assert.ok(res.nextAvailableAYs.includes('2028-29'));
  assert.ok(res.updatedPayments.every((p) => p.enrollmentAY === '2027-28'));
});

test('Combined XI + XII payment made in 2025-26 is detected as Paid in Advance when viewing 2026-27', () => {
  const { students } = createInitialSeedData('test_owner');
  const combinedPaidStudent = {
    ...students[0],
    enrollmentAY: '2025-26',
    progressionAY: '2026-27',
    admissionClass: 'XI' as const,
    classXIFee: 10000,
    classXIIFee: 10000,
    scholarshipDiscount: 0,
    paidClassXI: 10000,
    paidClassXII: 10000,
    totalPaid: 20000,
    xiPaymentDate: '24/05/2025',
    xiiPaymentDate: '24/05/2025',
  };
  const combinedPayment = {
    paymentId: 'pay_adv_1',
    studentId: combinedPaidStudent.studentId,
    ownerId: 'test_owner',
    studentName: combinedPaidStudent.fullName,
    rollNo: combinedPaidStudent.rollNo,
    stream: combinedPaidStudent.stream,
    enrollmentAY: '2025-26',
    progressionAY: '2026-27',
    recordedInAY: '2025-26',
    targetClass: 'INTEGRATED' as const,
    amount: 20000,
    allocatedToXI: 10000,
    allocatedToXII: 10000,
    paymentDate: '24/05/2025',
    paymentMode: 'UPI' as const,
    referenceNo: 'UPI',
    receiptNo: 'SF/2025-26/0001',
    installmentLabel: '1st + 2nd Year Combined (XI & XII Full)',
    notes: 'Combined advance payment',
    receiptStatus: 'active' as const,
  };

  const info = getYear2AdvancePaymentInfo(combinedPaidStudent, [combinedPayment]);
  assert.equal(info.isPaid, true);
  assert.equal(info.paidInAdvance, true);
  assert.equal(info.paidInAY, '2025-26');
  assert.equal(info.receiptNo, 'SF/2025-26/0001');

  // Verify student resolves cleanly in 2026-27 as Class XII, Full Paid, ₹0 pending
  const viewIn2627 = resolveStudentInAcademicYear(combinedPaidStudent, '2026-27');
  assert.ok(viewIn2627);
  assert.equal(viewIn2627.activeClassInSelectedAY, 'XII');
  assert.equal(viewIn2627.pendingClassXII, 0);
  assert.equal(viewIn2627.registerCategory, 'Full Paid');
});

test('Daily, Weekly, Monthly, and Quarterly collection analytics aggregate active receipts accurately', () => {
  const samplePayments = [
    {
      paymentId: 'p_1',
      studentId: 's_1',
      ownerId: 'u1',
      studentName: 'Student A',
      rollNo: '001',
      stream: 'Science (Integrated)',
      enrollmentAY: '2025-26',
      progressionAY: '2026-27',
      recordedInAY: '2025-26',
      targetClass: 'XI' as const,
      amount: 10000,
      fineAmount: 200,
      allocatedToXI: 10000,
      allocatedToXII: 0,
      paymentDate: '24/05/2025', // Sat, W21, May 2025, Q1 FY 2025-26
      paymentMode: 'UPI' as const,
      referenceNo: 'U1',
      receiptNo: 'SF/25-26/001',
      installmentLabel: '1st Year',
      notes: '',
      receiptStatus: 'active' as const,
    },
    {
      paymentId: 'p_2',
      studentId: 's_2',
      ownerId: 'u1',
      studentName: 'Student B',
      rollNo: '002',
      stream: 'Science (Integrated)',
      enrollmentAY: '2025-26',
      progressionAY: '2026-27',
      recordedInAY: '2025-26',
      targetClass: 'XI' as const,
      amount: 10000,
      fineAmount: 0,
      allocatedToXI: 10000,
      allocatedToXII: 0,
      paymentDate: '25/05/2025', // Sun, same ISO week W21, May 2025, Q1 FY 2025-26
      paymentMode: 'Cash' as const,
      referenceNo: '',
      receiptNo: 'SF/25-26/002',
      installmentLabel: '1st Year',
      notes: '',
      receiptStatus: 'active' as const,
    },
    {
      paymentId: 'p_3',
      studentId: 's_1',
      ownerId: 'u1',
      studentName: 'Student A',
      rollNo: '001',
      stream: 'Science (Integrated)',
      enrollmentAY: '2025-26',
      progressionAY: '2026-27',
      recordedInAY: '2025-26',
      targetClass: 'XII' as const,
      amount: 10000,
      fineAmount: 0,
      allocatedToXI: 0,
      allocatedToXII: 10000,
      paymentDate: '15/08/2025', // Aug 2025, Q2 FY 2025-26
      paymentMode: 'UPI' as const,
      referenceNo: 'U2',
      receiptNo: 'SF/25-26/003',
      installmentLabel: '2nd Year',
      notes: '',
      receiptStatus: 'active' as const,
    },
    {
      paymentId: 'p_rev',
      studentId: 's_3',
      ownerId: 'u1',
      studentName: 'Reversed Student',
      rollNo: '003',
      stream: 'Science (Integrated)',
      enrollmentAY: '2025-26',
      progressionAY: '2026-27',
      recordedInAY: '2025-26',
      targetClass: 'XI' as const,
      amount: 10000,
      fineAmount: 0,
      allocatedToXI: 10000,
      allocatedToXII: 0,
      paymentDate: '24/05/2025',
      paymentMode: 'UPI' as const,
      referenceNo: 'REV',
      receiptNo: 'SF/25-26/004',
      installmentLabel: '1st Year',
      notes: '',
      receiptStatus: 'reversed' as const,
    },
  ];

  // Daily: 3 active dates (reversed excluded)
  const daily = aggregateCollectionByPeriod(samplePayments, 'daily');
  assert.equal(daily.buckets.length, 3);
  assert.equal(daily.grandTotal, 30200);
  assert.equal(daily.xiTotal, 20000);
  assert.equal(daily.xiiTotal, 10000);
  assert.equal(daily.fineTotal, 200);

  // Weekly: 24/05 (Sat) and 25/05 (Sun) merge into same ISO week!
  const weekly = aggregateCollectionByPeriod(samplePayments, 'weekly');
  assert.equal(weekly.buckets.length, 2);
  const mayWeek = weekly.buckets.find((b) => b.receiptCount === 2);
  assert.ok(mayWeek);
  assert.equal(mayWeek.grandTotal, 20200);

  // Monthly: May 2025 (20,200) + Aug 2025 (10,000)
  const monthly = aggregateCollectionByPeriod(samplePayments, 'monthly');
  assert.equal(monthly.buckets.length, 2);
  assert.equal(monthly.buckets[0].key, '2025-08');
  assert.equal(monthly.buckets[1].key, '2025-05');
  assert.equal(monthly.buckets[1].grandTotal, 20200);

  // Quarterly: Q2 (Jul-Sep 2025) & Q1 (Apr-Jun 2025)
  const quarterly = aggregateCollectionByPeriod(samplePayments, 'quarterly');
  assert.equal(quarterly.buckets.length, 2);
  assert.equal(quarterly.buckets[0].key, '2025-Q2');
  assert.equal(quarterly.buckets[1].key, '2025-Q1');
  assert.equal(quarterly.buckets[1].grandTotal, 20200);
  assert.equal(quarterly.buckets[0].grandTotal, 10000);

  // Mode filter: Cash only
  const cashOnly = aggregateCollectionByPeriod(samplePayments, 'monthly', {
    modeFilter: 'Cash',
  });
  assert.equal(cashOnly.grandTotal, 10000);
  assert.equal(cashOnly.totalReceipts, 1);

  // Single-date filter: 2025-05-24 only (excludes 25/05, 15/08, and reversed 24/05)
  const singleDate = aggregateCollectionByPeriod(samplePayments, 'daily', {
    fromDateISO: '2025-05-24',
    toDateISO: '2025-05-24',
  });
  assert.equal(singleDate.buckets.length, 1);
  assert.equal(singleDate.buckets[0].key, '2025-05-24');
  assert.equal(singleDate.grandTotal, 10200);
  assert.equal(singleDate.totalReceipts, 1);

  // Date-range filter: 2025-05-01 to 2025-06-30 (excludes August 2025 receipt)
  const dateRange = aggregateCollectionByPeriod(samplePayments, 'daily', {
    fromDateISO: '2025-05-01',
    toDateISO: '2025-06-30',
  });
  assert.equal(dateRange.buckets.length, 2);
  assert.equal(dateRange.grandTotal, 20200);
  assert.equal(dateRange.totalReceipts, 2);
});

test('Part payment on 1st Year or 2nd Year marks status as Partial-Paid and remaining balance auto-clears on second payment', () => {
  const { students } = createInitialSeedData('test_owner');
  const headerConfig = buildDefaultHeaderConfig(['2025-26', '2026-27']);
  const unpaidStudent = {
    ...students[0],
    studentId: 'st_partial_flow',
    enrollmentAY: '2026-27',
    progressionAY: '2027-28',
    admissionClass: 'XI' as const,
    classXIFee: 10000,
    classXIIFee: 10000,
    scholarshipDiscount: 0,
    totalIntegratedFee: 20000,
    paidClassXI: 0,
    paidClassXII: 0,
    totalPaid: 0,
    remarks: 'Fee Pending',
  };

  // Step 1: Pay ₹5,000 part payment towards 1st Year (XI)
  const alloc1 = calculatePaymentAllocation(unpaidStudent, 5000, 'XI');
  assert.equal(alloc1.allocatedToXI, 5000);
  assert.equal(alloc1.newPaidClassXI, 5000);
  const afterPart1 = {
    ...unpaidStudent,
    paidClassXI: alloc1.newPaidClassXI,
    paidClassXII: alloc1.newPaidClassXII,
    totalPaid: alloc1.newTotalPaid,
  };
  const cat1 = computeDynamicRegisterCategory(afterPart1, '2026-27');
  assert.equal(cat1, 'Partial Paid (₹5k Due)');
  assert.equal(getStatusDisplayLabel(headerConfig, cat1), 'Partial-Paid');

  // Remaining for 1st Year is ₹5,000
  const remXI = afterPart1.classXIFee - afterPart1.paidClassXI;
  assert.equal(remXI, 5000);

  // Step 2: Pay remaining ₹5,000 -> 1st Year fully paid -> transitions to Only XI Paid
  const alloc2 = calculatePaymentAllocation(afterPart1, remXI, 'XI');
  const afterPart2 = {
    ...afterPart1,
    paidClassXI: alloc2.newPaidClassXI,
    paidClassXII: alloc2.newPaidClassXII,
    totalPaid: alloc2.newTotalPaid,
  };
  assert.equal(afterPart2.paidClassXI, 10000);
  assert.equal(computeDynamicRegisterCategory(afterPart2, '2026-27'), 'Only XI Paid');

  // Step 3: Pay ₹4,000 part payment towards 2nd Year (XII) -> Partial-Paid with ₹6,000 remaining
  const alloc3 = calculatePaymentAllocation(afterPart2, 4000, 'XII');
  const afterPart3 = {
    ...afterPart2,
    paidClassXI: alloc3.newPaidClassXI,
    paidClassXII: alloc3.newPaidClassXII,
    totalPaid: alloc3.newTotalPaid,
  };
  assert.equal(afterPart3.paidClassXII, 4000);
  const cat3 = computeDynamicRegisterCategory(afterPart3, '2027-28');
  assert.equal(cat3, 'Partial Paid (₹5k Due)');
  assert.equal(getStatusDisplayLabel(headerConfig, cat3), 'Partial-Paid');

  // Step 4: Pay remaining ₹6,000 -> Full Paid
  const alloc4 = calculatePaymentAllocation(afterPart3, 6000, 'XII');
  const afterPart4 = {
    ...afterPart3,
    paidClassXI: alloc4.newPaidClassXI,
    paidClassXII: alloc4.newPaidClassXII,
    totalPaid: alloc4.newTotalPaid,
  };
  assert.equal(computeDynamicRegisterCategory(afterPart4, '2027-28'), 'Full Paid');
});





