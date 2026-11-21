import {
  AllocationTarget,
  BatchHeadItem,
  BlueprintConstraints,
  ClassLevel,
  CollectionPeriodType,
  HeaderConfig,
  ImportConflictRow,
  PaymentMode,
  PaymentRecord,
  PeriodCollectionBucket,
  PeriodCollectionReport,
  RegisterStatusCategory,
  StudentInAcademicYearView,
  StudentRecord,
} from '../types';
import { buildRealRegisterRecords } from './realRegisterData';

/**
 * Extracts the starting 4-digit year of an Academic Year string like "2026-27" -> 2026.
 */
export function getAcademicYearStart(ay: string): number {
  const match = ay.trim().match(/^(\d{4})-(\d{2,4})$/);
  return match ? parseInt(match[1], 10) : 2026;
}

/**
 * Compares two Academic Year strings chronologically.
 * Returns < 0 if a < b, 0 if equal, > 0 if a > b.
 */
export function compareAcademicYears(a: string, b: string): number {
  return getAcademicYearStart(a) - getAcademicYearStart(b);
}

/**
 * Given an enrollment Academic Year like "2025-26", computes the consecutive Academic Year "2026-27".
 */
export function getNextAcademicYear(ay: string): string {
  const cleaned = ay.trim();
  const match = cleaned.match(/^(\d{4})-(\d{2,4})$/);
  if (!match) {
    return '2026-27';
  }
  const startYear = parseInt(match[1], 10);
  const nextStart = startYear + 1;
  const nextEndShort = String((nextStart + 1) % 100).padStart(2, '0');
  return `${nextStart}-${nextEndShort}`;
}

/**
 * Given an Academic Year like "2026-27", computes the previous Academic Year "2025-26".
 */
export function getPreviousAcademicYear(ay: string): string {
  const cleaned = ay.trim();
  const match = cleaned.match(/^(\d{4})-(\d{2,4})$/);
  if (!match) {
    return '2025-26';
  }
  const startYear = parseInt(match[1], 10);
  const prevStart = startYear - 1;
  const prevEndShort = String((prevStart + 1) % 100).padStart(2, '0');
  return `${prevStart}-${prevEndShort}`;
}

/**
 * Formats a number in Indian Rupee numbering system (e.g., ₹10,000 or ₹15,85,000).
 */
export function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(safe);
}

/**
 * Detects auto-generated synthetic placeholder phone numbers (e.g., 9820110001..9820110999)
 * or blank strings so staff see a clear "Phone missing" indicator rather than fake numbers.
 */
export function isPlaceholderPhone(phone?: string | null): boolean {
  const cleaned = (phone || '').replace(/\s+/g, '').trim();
  if (!cleaned || cleaned === '-') return true;
  if (/^9820110\d{3}$/.test(cleaned)) return true;
  if (/^0+$/.test(cleaned)) return true;
  return false;
}

/**
 * Returns a real parent phone number or empty string if missing/placeholder.
 */
export function getEditablePhone(phone?: string | null): string {
  return isPlaceholderPhone(phone) ? '' : (phone || '').trim();
}

/**
 * Helpers for active vs. soft-reversed payment records.
 */
export function isReversedPayment(payment: PaymentRecord): boolean {
  return payment.receiptStatus === 'reversed';
}

export function isActivePayment(payment: PaymentRecord): boolean {
  return payment.receiptStatus !== 'reversed';
}

/**
 * Computes net Class XI and Class XII target fees after scholarship discount.
 */
export function computeNetYearFees(
  classXIFee: number,
  classXIIFee: number,
  scholarshipDiscount: number
): { netClassXIFee: number; netClassXIIFee: number; totalIntegratedFee: number } {
  const grossXI = Math.max(0, Math.round(classXIFee));
  const grossXII = Math.max(0, Math.round(classXIIFee));
  const discount = Math.max(
    0,
    Math.min(grossXI + grossXII, Math.round(scholarshipDiscount))
  );

  if (grossXII === 0) {
    const netXI = Math.max(0, grossXI - discount);
    return { netClassXIFee: netXI, netClassXIIFee: 0, totalIntegratedFee: netXI };
  }
  if (grossXI === 0) {
    const netXII = Math.max(0, grossXII - discount);
    return { netClassXIFee: 0, netClassXIIFee: netXII, totalIntegratedFee: netXII };
  }

  const halfDiscount = Math.floor(discount / 2);
  const remainderDiscount = discount - halfDiscount;

  let netXI = grossXI - halfDiscount;
  let netXII = grossXII - remainderDiscount;

  if (netXI < 0) {
    netXII = Math.max(0, netXII + netXI);
    netXI = 0;
  } else if (netXII < 0) {
    netXI = Math.max(0, netXI + netXII);
    netXII = 0;
  }

  return {
    netClassXIFee: netXI,
    netClassXIIFee: netXII,
    totalIntegratedFee: netXI + netXII,
  };
}

/**
 * Determines whether Class XII fee is actively due for a student in a given reference Academic Year.
 * Example:
 * - Batch 2025-26 has progressionAY = 2026-27 -> Class XII is due in 2026-27 (and later).
 * - Batch 2026-27 has progressionAY = 2027-28 -> Class XII is upcoming in 2026-27, and due in 2027-28+.
 */
export function isClassXIIDueInAY(
  student: Pick<StudentRecord, 'admissionClass' | 'enrollmentAY' | 'progressionAY'>,
  referenceAY = '2026-27'
): boolean {
  if (student.admissionClass === 'XII') return true;
  const targetAY = referenceAY === 'ALL_BATCHES' ? '2026-27' : referenceAY;
  return compareAcademicYears(targetAY, student.progressionAY) >= 0;
}

/**
 * Dynamically derives the exact RegisterStatusCategory for a student based on live paid amounts,
 * enrollment batch, and the active reference Academic Year (works cleanly for 2025-26, 2026-27, 2027-28, and beyond).
 */
export function computeDynamicRegisterCategory(
  student: StudentRecord,
  referenceAY = '2026-27'
): RegisterStatusCategory {
  if (
    student.status === 'dropped' ||
    student.remarks === 'Admission Cancelled'
  ) {
    return 'Admission Cancelled';
  }

  const { netClassXIFee, netClassXIIFee, totalIntegratedFee } =
    computeNetYearFees(
      student.classXIFee,
      student.classXIIFee,
      student.scholarshipDiscount
    );

  if (student.admissionClass === 'XII' || student.remarks === 'Direct XII Paid') {
    if (student.paidClassXII >= netClassXIIFee && netClassXIIFee > 0) {
      return 'Direct XII Paid';
    }
  }

  if (student.totalPaid >= totalIntegratedFee && totalIntegratedFee > 0) {
    return 'Full Paid';
  }

  if (student.totalPaid === 0) {
    return 'Fee Pending';
  }

  if (
    (student.paidClassXI > 0 && student.paidClassXI < netClassXIFee) ||
    (student.paidClassXII > 0 && student.paidClassXII < netClassXIIFee)
  ) {
    return 'Partial Paid (₹5k Due)';
  }

  if (student.remarks === 'XII Will Pay June 26' && student.paidClassXII === 0) {
    return 'XII Will Pay June 26';
  }

  if (
    student.paidClassXI >= netClassXIFee &&
    student.paidClassXII < netClassXIIFee
  ) {
    if (isClassXIIDueInAY(student, referenceAY)) {
      return 'XII Pending';
    }
    return 'Only XI Paid';
  }

  return (student.remarks as RegisterStatusCategory) || 'Only XI Paid';
}

/**
 * Returns true if a student currently has an actionable pending due in the reference Academic Year.
 */
export function isStudentDueInAY(
  student: StudentRecord,
  referenceAY = '2026-27'
): boolean {
  const cat = computeDynamicRegisterCategory(student, referenceAY);
  return (
    cat === 'XII Pending' ||
    cat === 'XII Will Pay June 26' ||
    cat === 'Partial Paid (₹5k Due)' ||
    cat === 'Fee Pending'
  );
}

/**
 * Allocates a payment amount across Class XI and Class XII fees.
 */
export function calculatePaymentAllocation(
  student: StudentRecord,
  paymentAmount: number,
  targetClass: AllocationTarget
): {
  allocatedToXI: number;
  allocatedToXII: number;
  newPaidClassXI: number;
  newPaidClassXII: number;
  newTotalPaid: number;
} {
  const amt = Math.max(0, Math.round(paymentAmount));
  const { netClassXIFee, netClassXIIFee } = computeNetYearFees(
    student.classXIFee,
    student.classXIIFee,
    student.scholarshipDiscount
  );

  const remXI = Math.max(0, netClassXIFee - student.paidClassXI);
  const remXII = Math.max(0, netClassXIIFee - student.paidClassXII);

  let allocatedToXI = 0;
  let allocatedToXII = 0;

  if (targetClass === 'INTEGRATED') {
    allocatedToXI = Math.min(amt, remXI);
    allocatedToXII = amt - allocatedToXI;
  } else if (targetClass === 'XI') {
    const primaryXI = Math.min(amt, remXI);
    const spillXII = Math.min(amt - primaryXI, remXII);
    const excess = amt - primaryXI - spillXII;
    allocatedToXI = primaryXI + excess;
    allocatedToXII = spillXII;
  } else {
    const primaryXII = Math.min(amt, remXII);
    const spillXI = Math.min(amt - primaryXII, remXI);
    const excess = amt - primaryXII - spillXI;
    allocatedToXII = primaryXII + excess;
    allocatedToXI = spillXI;
  }

  const newPaidClassXI = student.paidClassXI + allocatedToXI;
  const newPaidClassXII = student.paidClassXII + allocatedToXII;
  const newTotalPaid = newPaidClassXI + newPaidClassXII;

  return {
    allocatedToXI,
    allocatedToXII,
    newPaidClassXI,
    newPaidClassXII,
    newTotalPaid,
  };
}

/**
 * Generates the next deterministic sequential receipt number for an Academic Year (e.g. SF/2026-27/0001).
 */
export function generateNextReceiptNo(
  payments: PaymentRecord[],
  academicYear: string,
  prefix = 'SF'
): string {
  const cleanPrefix = (prefix.trim().replace(/[^a-zA-Z0-9]/g, '') || 'SF').toUpperCase();
  const safeAY = BlueprintConstraints.AY_PATTERN.test(academicYear)
    ? academicYear
    : '2026-27';
  const expectedStart = `${cleanPrefix}/${safeAY}/`;

  let maxSeq = 0;
  payments.forEach((p) => {
    if (p.receiptNo && p.receiptNo.startsWith(expectedStart)) {
      const numPart = parseInt(p.receiptNo.slice(expectedStart.length), 10);
      if (Number.isFinite(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  });

  const nextNum = Math.max(maxSeq + 1, payments.length + 1);
  return `${expectedStart}${String(nextNum).padStart(4, '0')}`;
}

/**
 * Parses register dates like "24/05/2025", "2026-04-04", "04-04-2026", or "May 2025" into YYYY-MM-DD.
 * Returns null if unparseable or "-".
 */
export function parseRegisterDateToISO(dateStr?: string | null): string | null {
  const raw = (dateStr || '').trim();
  if (!raw || raw === '-') return null;

  // YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  // Month YYYY (e.g. "May 2025") -> map to 1st of that month for chronological sorting
  const monthNames: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };
  const myMatch = raw.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (myMatch) {
    const mKey = myMatch[1].slice(0, 3).toLowerCase();
    if (monthNames[mKey]) {
      return `${myMatch[2]}-${monthNames[mKey]}-01`;
    }
  }

  return null;
}

export interface CashbookModeBreakdown {
  mode: PaymentMode;
  count: number;
  tuitionTotal: number;
  fineTotal: number;
  grandTotal: number;
}

export interface CashbookSummary {
  matchingActiveReceipts: PaymentRecord[];
  matchingReversedReceipts: PaymentRecord[];
  activeCount: number;
  reversedCount: number;
  tuitionTotal: number;
  fineTotal: number;
  grandTotal: number;
  byMode: CashbookModeBreakdown[];
}

const ALL_MODES: PaymentMode[] = [
  'UPI',
  'Cash',
  'NEFT/RTGS',
  'Cheque',
  'Card',
  'DD',
];

/**
 * Pure aggregator for the Daily Cashbook & Mode-Wise Collection Reconciliation report.
 */
export function aggregateCashbook(
  payments: PaymentRecord[],
  fromISO: string,
  toISO: string,
  modeFilter: 'ALL' | PaymentMode = 'ALL'
): CashbookSummary {
  const modeMap = new Map<PaymentMode, CashbookModeBreakdown>();
  ALL_MODES.forEach((m) =>
    modeMap.set(m, {
      mode: m,
      count: 0,
      tuitionTotal: 0,
      fineTotal: 0,
      grandTotal: 0,
    })
  );

  const matchingActiveReceipts: PaymentRecord[] = [];
  const matchingReversedReceipts: PaymentRecord[] = [];
  let tuitionTotal = 0;
  let fineTotal = 0;

  payments.forEach((p) => {
    if (modeFilter !== 'ALL' && p.paymentMode !== modeFilter) return;

    const iso = parseRegisterDateToISO(p.paymentDate);
    if (fromISO && (!iso || iso < fromISO)) return;
    if (toISO && (!iso || iso > toISO)) return;

    if (isReversedPayment(p)) {
      matchingReversedReceipts.push(p);
      return;
    }

    const fine = Math.max(0, Math.round(Number(p.fineAmount) || 0));
    const tuition = Math.max(0, Math.round(Number(p.amount) || 0));

    matchingActiveReceipts.push(p);
    tuitionTotal += tuition;
    fineTotal += fine;

    const entry = modeMap.get(p.paymentMode);
    if (entry) {
      entry.count += 1;
      entry.tuitionTotal += tuition;
      entry.fineTotal += fine;
      entry.grandTotal += tuition + fine;
    }
  });

  // Sort most recent payment date first
  matchingActiveReceipts.sort((a, b) => {
    const isoA = parseRegisterDateToISO(a.paymentDate) || '';
    const isoB = parseRegisterDateToISO(b.paymentDate) || '';
    return isoB.localeCompare(isoA);
  });

  return {
    matchingActiveReceipts,
    matchingReversedReceipts,
    activeCount: matchingActiveReceipts.length,
    reversedCount: matchingReversedReceipts.length,
    tuitionTotal,
    fineTotal,
    grandTotal: tuitionTotal + fineTotal,
    byMode: ALL_MODES.map((m) => modeMap.get(m)!),
  };
}

/**
 * Classifies incoming Excel rows against existing students to prevent accidental duplicates.
 */
export function reconcileImportedStudents(
  incomingRows: Omit<StudentRecord, 'createdAt' | 'updatedAt'>[],
  existingStudents: StudentRecord[]
): ImportConflictRow[] {
  const byRoll = new Map<string, StudentRecord>();
  const byNameBatch = new Map<string, StudentRecord>();

  existingStudents.forEach((st) => {
    const rKey = st.rollNo.trim().toLowerCase();
    if (rKey) byRoll.set(rKey, st);
    const nbKey = `${st.fullName.replace(/\s+/g, ' ').trim().toLowerCase()}|${st.enrollmentAY}`;
    byNameBatch.set(nbKey, st);
  });

  return incomingRows.map((inc) => {
    const rKey = inc.rollNo.trim().toLowerCase();
    const nbKey = `${inc.fullName.replace(/\s+/g, ' ').trim().toLowerCase()}|${inc.enrollmentAY}`;

    const matchedByEc = rKey ? byRoll.get(rKey) : undefined;
    if (matchedByEc) {
      return {
        incoming: inc,
        matchType: 'duplicate_ec',
        existingStudent: matchedByEc,
        missingPhone: isPlaceholderPhone(inc.phone),
      };
    }

    const matchedByName = byNameBatch.get(nbKey);
    if (matchedByName) {
      return {
        incoming: inc,
        matchType: 'duplicate_name',
        existingStudent: matchedByName,
        missingPhone: isPlaceholderPhone(inc.phone),
      };
    }

    return {
      incoming: inc,
      matchType: 'new',
      missingPhone: isPlaceholderPhone(inc.phone),
    };
  });
}

/**
 * Generates verifiable opening PaymentRecords when a newly created or Excel-imported student
 * already carries pre-paid Class XI or Class XII balances.
 */
export function buildOpeningPaymentsForStudent(
  student: Omit<StudentRecord, 'createdAt' | 'updatedAt'>,
  existingPayments: PaymentRecord[],
  receiptPrefix = 'SF'
): PaymentRecord[] {
  const created: PaymentRecord[] = [];
  const runningList = [...existingPayments];

  if (student.paidClassXI > 0) {
    const rcpNo = generateNextReceiptNo(
      runningList,
      student.enrollmentAY,
      receiptPrefix
    );
    const payXI: PaymentRecord = {
      paymentId: `pay_op_xi_${student.studentId}_${Date.now().toString().slice(-4)}`,
      studentId: student.studentId,
      ownerId: student.ownerId,
      studentName: student.fullName.slice(0, 120),
      rollNo: student.rollNo.slice(0, 40),
      stream: student.stream.slice(0, 60),
      enrollmentAY: student.enrollmentAY,
      progressionAY: student.progressionAY,
      recordedInAY: student.enrollmentAY,
      targetClass: 'XI',
      amount: student.paidClassXI,
      allocatedToXI: student.paidClassXI,
      allocatedToXII: 0,
      paymentDate:
        student.xiPaymentDate && student.xiPaymentDate !== '-'
          ? student.xiPaymentDate.slice(0, 30)
          : `10/06/${student.enrollmentAY.slice(0, 4)}`,
      paymentMode: 'UPI',
      referenceNo: 'OPENING-XI',
      receiptNo: rcpNo,
      installmentLabel: 'Fees In Term - I (Class XI Opening Entry)',
      notes: `Opening Class XI balance for Batch ${student.enrollmentAY}`,
      fineAmount: 0,
      receiptStatus: 'active',
    };
    created.push(payXI);
    runningList.push(payXI);
  }

  if (student.paidClassXII > 0) {
    const rcpNo = generateNextReceiptNo(
      runningList,
      student.progressionAY,
      receiptPrefix
    );
    const payXII: PaymentRecord = {
      paymentId: `pay_op_xii_${student.studentId}_${Date.now().toString().slice(-4)}`,
      studentId: student.studentId,
      ownerId: student.ownerId,
      studentName: student.fullName.slice(0, 120),
      rollNo: student.rollNo.slice(0, 40),
      stream: student.stream.slice(0, 60),
      enrollmentAY: student.enrollmentAY,
      progressionAY: student.progressionAY,
      recordedInAY: student.progressionAY,
      targetClass: 'XII',
      amount: student.paidClassXII,
      allocatedToXI: 0,
      allocatedToXII: student.paidClassXII,
      paymentDate:
        student.xiiPaymentDate && student.xiiPaymentDate !== '-'
          ? student.xiiPaymentDate.slice(0, 30)
          : `10/06/${student.progressionAY.slice(0, 4)}`,
      paymentMode: 'UPI',
      referenceNo: 'OPENING-XII',
      receiptNo: rcpNo,
      installmentLabel:
        student.admissionClass === 'XII'
          ? 'Fees In Term - II (Direct Class XII Opening Entry)'
          : 'Fees In Term - II (Class XII Opening Entry)',
      notes: `Opening Class XII balance for Batch ${student.enrollmentAY}`,
      fineAmount: 0,
      receiptStatus: 'active',
    };
    created.push(payXII);
    runningList.push(payXII);
  }

  return created;
}

/**
 * Determines whether a student belongs in a selected Academic Year (e.g., "2025-26", "2026-27", "2027-28", or "ALL_BATCHES")
 * and returns their computed Class XI or Class XII status for that Academic Year.
 */
export function resolveStudentInAcademicYear(
  student: StudentRecord,
  selectedAY: string
): StudentInAcademicYearView | null {
  let activeClassInSelectedAY: ClassLevel | null = null;
  let isPromotedFromPreviousAY = false;

  if (selectedAY === 'ALL_BATCHES') {
    activeClassInSelectedAY = student.admissionClass;
    isPromotedFromPreviousAY = false;
  } else if (student.admissionClass === 'XI') {
    if (student.enrollmentAY === selectedAY) {
      activeClassInSelectedAY = 'XI';
      isPromotedFromPreviousAY = false;
    } else if (student.progressionAY === selectedAY) {
      activeClassInSelectedAY = 'XII';
      isPromotedFromPreviousAY = true;
    }
  } else {
    // Direct Class XII admission
    if (
      student.enrollmentAY === selectedAY ||
      student.progressionAY === selectedAY
    ) {
      activeClassInSelectedAY = 'XII';
      isPromotedFromPreviousAY = student.progressionAY === selectedAY;
    }
  }

  if (!activeClassInSelectedAY) {
    return null;
  }

  const { netClassXIFee, netClassXIIFee, totalIntegratedFee } =
    computeNetYearFees(
      student.classXIFee,
      student.classXIIFee,
      student.scholarshipDiscount
    );

  const pendingClassXI = Math.max(0, netClassXIFee - student.paidClassXI);
  const pendingClassXII = Math.max(0, netClassXIIFee - student.paidClassXII);
  const totalPendingIntegrated = Math.max(
    0,
    totalIntegratedFee - student.totalPaid
  );

  const overallPaymentStatus: 'FULLY_PAID' | 'PARTIAL' | 'NO_PAYMENT' =
    totalPendingIntegrated <= 0 && totalIntegratedFee > 0
      ? 'FULLY_PAID'
      : student.totalPaid > 0
      ? 'PARTIAL'
      : 'NO_PAYMENT';

  const activeTarget =
    activeClassInSelectedAY === 'XI' ? netClassXIFee : netClassXIIFee;
  const activePaid =
    activeClassInSelectedAY === 'XI'
      ? student.paidClassXI
      : student.paidClassXII;
  const activePending = Math.max(0, activeTarget - activePaid);

  const activeClassPaymentStatus: 'FULLY_PAID' | 'PARTIAL' | 'NO_PAYMENT' =
    activePending <= 0 && activeTarget > 0
      ? 'FULLY_PAID'
      : activePaid > 0
      ? 'PARTIAL'
      : 'NO_PAYMENT';

  const integratedProgressPercent =
    totalIntegratedFee > 0
      ? Math.min(
          100,
          Math.round((student.totalPaid / totalIntegratedFee) * 100)
        )
      : 0;

  const cohortLabel =
    student.admissionClass === 'XI'
      ? `Batch ${student.enrollmentAY} (XI) → ${student.progressionAY} (XII)`
      : `Batch ${student.enrollmentAY} (Direct XII)`;

  const registerCategory = computeDynamicRegisterCategory(student, selectedAY);

  return {
    student: {
      ...student,
      remarks: registerCategory,
    },
    activeClassInSelectedAY,
    cohortLabel,
    isPromotedFromPreviousAY,
    netClassXIFee,
    netClassXIIFee,
    pendingClassXI,
    pendingClassXII,
    totalPendingIntegrated,
    overallPaymentStatus,
    activeClassPaymentStatus,
    integratedProgressPercent,
    registerCategory,
  };
}

/**
 * Formats DD/MM/YYYY from YYYY-MM-DD input date when recording a new fee payment.
 */
export function formatToRegisterDate(isoOrDateStr: string): string {
  const trimmed = isoOrDateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return trimmed || '-';
}

const DANGEROUS_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const VALID_PAYMENT_MODES: ReadonlySet<PaymentRecord['paymentMode']> = new Set([
  'UPI',
  'NEFT/RTGS',
  'Cheque',
  'Cash',
  'Card',
  'DD',
]);

/**
 * Safely parses JSON while stripping prototype-polluting property names (__proto__, constructor, prototype).
 */
export function safeJsonParse<T = unknown>(raw: string): T {
  return JSON.parse(raw, (key, value) => {
    if (DANGEROUS_JSON_KEYS.has(key)) {
      return undefined;
    }
    return value;
  }) as T;
}

function asCleanString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

function sanitizeIdentifier(value: unknown, fallbackPrefix: string, maxLen = 64): string {
  const cleaned = asCleanString(value)
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .slice(0, maxLen);
  return cleaned || `${fallbackPrefix}_${Date.now()}`;
}

/**
 * Sanitizes a StudentRecord before sending to Firestore to guarantee compliance with firebase-blueprint.json.
 */
export function sanitizeStudentPayload(
  raw:
    | Partial<Omit<StudentRecord, 'createdAt' | 'updatedAt'>>
    | Record<string, unknown>
): Omit<StudentRecord, 'createdAt' | 'updatedAt'> {
  const rawEnrollAY = asCleanString(raw.enrollmentAY);
  const rawProgAY = asCleanString(raw.progressionAY);
  const enrollmentAY = BlueprintConstraints.AY_PATTERN.test(rawEnrollAY)
    ? rawEnrollAY
    : '2025-26';
  const progressionAY = BlueprintConstraints.AY_PATTERN.test(rawProgAY)
    ? rawProgAY
    : getNextAcademicYear(enrollmentAY);

  const rawRemarks = asCleanString(raw.remarks);
  const isCancelled =
    raw.status === 'dropped' || rawRemarks === 'Admission Cancelled';

  const paidClassXI = Math.min(
    BlueprintConstraints.MAX_FEE,
    Math.max(0, Math.round(Number(raw.paidClassXI) || 0))
  );
  const paidClassXII = Math.min(
    BlueprintConstraints.MAX_FEE,
    Math.max(0, Math.round(Number(raw.paidClassXII) || 0))
  );
  const totalPaid = paidClassXI + paidClassXII;

  const classXIFee = isCancelled
    ? paidClassXI
    : Math.min(
        BlueprintConstraints.MAX_FEE,
        Math.max(0, Math.round(Number(raw.classXIFee) || 0))
      );
  const classXIIFee = isCancelled
    ? paidClassXII
    : Math.min(
        BlueprintConstraints.MAX_FEE,
        Math.max(0, Math.round(Number(raw.classXIIFee) || 0))
      );
  const scholarshipDiscount = isCancelled
    ? 0
    : Math.min(
        BlueprintConstraints.MAX_FEE,
        classXIFee + classXIIFee,
        Math.max(0, Math.round(Number(raw.scholarshipDiscount) || 0))
      );
  const { totalIntegratedFee } = computeNetYearFees(
    classXIFee,
    classXIIFee,
    scholarshipDiscount
  );

  const normalizedStatus: StudentRecord['status'] = isCancelled
    ? 'dropped'
    : raw.status === 'completed'
    ? 'completed'
    : 'active';

  const xiPaymentDate = (asCleanString(raw.xiPaymentDate) || '-').slice(0, 40);
  const xiiPaymentDate = (asCleanString(raw.xiiPaymentDate) || '-').slice(0, 40);
  const rollNo = (asCleanString(raw.rollNo) || 'SR-001').slice(
    0,
    BlueprintConstraints.MAX_ROLL_NO
  );
  const fullName = (asCleanString(raw.fullName) || 'Student').slice(
    0,
    BlueprintConstraints.MAX_NAME
  );
  const fatherName = asCleanString(raw.fatherName).slice(
    0,
    BlueprintConstraints.MAX_NAME
  );
  const phone = asCleanString(raw.phone).slice(
    0,
    BlueprintConstraints.MAX_PHONE
  );
  const stream = (asCleanString(raw.stream) || 'Science (Integrated)').slice(
    0,
    BlueprintConstraints.MAX_STREAM
  );
  const centerName = (
    asCleanString(raw.centerName) || `Batch ${enrollmentAY}`
  ).slice(0, BlueprintConstraints.MAX_CENTER);
  const studentId = sanitizeIdentifier(raw.studentId, 'stu', 64);
  const ownerId = sanitizeIdentifier(raw.ownerId, 'local_workspace', 128);
  const admissionClass: StudentRecord['admissionClass'] =
    raw.admissionClass === 'XII' ? 'XII' : 'XI';

  const tempStudent: StudentRecord = {
    studentId,
    ownerId,
    rollNo,
    fullName,
    fatherName,
    phone,
    stream,
    centerName,
    enrollmentAY,
    progressionAY,
    admissionClass,
    classXIFee,
    classXIIFee,
    scholarshipDiscount,
    totalIntegratedFee,
    paidClassXI,
    paidClassXII,
    totalPaid,
    xiPaymentDate,
    xiiPaymentDate,
    status: normalizedStatus,
    remarks: rawRemarks,
  };

  const derivedRemark = computeDynamicRegisterCategory(tempStudent);

  return {
    ...tempStudent,
    remarks: (derivedRemark || rawRemarks || 'Only XI Paid')
      .trim()
      .slice(0, BlueprintConstraints.MAX_REMARKS),
  };
}

/**
 * Sanitizes a PaymentRecord before sending to Firestore to guarantee compliance with firestore.rules.
 */
export function sanitizePaymentPayload(
  raw:
    | Partial<Omit<PaymentRecord, 'createdAt' | 'updatedAt'>>
    | Record<string, unknown>
): Omit<PaymentRecord, 'createdAt' | 'updatedAt'> {
  const targetClass: PaymentRecord['targetClass'] =
    raw.targetClass === 'XI' || raw.targetClass === 'XII'
      ? raw.targetClass
      : 'INTEGRATED';

  let allocatedToXI = Math.min(
    BlueprintConstraints.MAX_FEE,
    Math.max(0, Math.round(Number(raw.allocatedToXI) || 0))
  );
  let allocatedToXII = Math.min(
    BlueprintConstraints.MAX_FEE,
    Math.max(0, Math.round(Number(raw.allocatedToXII) || 0))
  );

  // Guarantee amount > 0, amount <= 10,000,000, and allocatedToXI + allocatedToXII === amount
  if (allocatedToXI + allocatedToXII <= 0) {
    const fallbackAmount = Math.min(
      BlueprintConstraints.MAX_FEE,
      Math.max(1, Math.round(Number(raw.amount) || 1))
    );
    if (targetClass === 'XII') {
      allocatedToXII = fallbackAmount;
    } else {
      allocatedToXI = fallbackAmount;
    }
  } else if (allocatedToXI + allocatedToXII > BlueprintConstraints.MAX_FEE) {
    allocatedToXII = Math.max(0, BlueprintConstraints.MAX_FEE - allocatedToXI);
  }
  const amount = allocatedToXI + allocatedToXII;

  const fineAmount = Math.min(
    1000000,
    Math.max(0, Math.round(Number(raw.fineAmount) || 0))
  );

  const rawEnrollAY = asCleanString(raw.enrollmentAY);
  const rawProgAY = asCleanString(raw.progressionAY);
  const rawRecAY = asCleanString(raw.recordedInAY);
  const enrollmentAY = BlueprintConstraints.AY_PATTERN.test(rawEnrollAY)
    ? rawEnrollAY
    : '2025-26';
  const progressionAY = BlueprintConstraints.AY_PATTERN.test(rawProgAY)
    ? rawProgAY
    : getNextAcademicYear(enrollmentAY);
  const recordedInAY = BlueprintConstraints.AY_PATTERN.test(rawRecAY)
    ? rawRecAY
    : progressionAY;

  const rawMode = asCleanString(raw.paymentMode) as PaymentRecord['paymentMode'];
  const paymentMode: PaymentRecord['paymentMode'] = VALID_PAYMENT_MODES.has(
    rawMode
  )
    ? rawMode
    : 'Cash';

  const sanitized: Omit<PaymentRecord, 'createdAt' | 'updatedAt'> = {
    paymentId: sanitizeIdentifier(raw.paymentId, 'pay', 64),
    studentId: sanitizeIdentifier(raw.studentId, 'stu', 64),
    ownerId: sanitizeIdentifier(raw.ownerId, 'local_workspace', 128),
    studentName: (asCleanString(raw.studentName) || 'Student').slice(0, 120),
    rollNo: (asCleanString(raw.rollNo) || 'SR-001').slice(0, 40),
    stream: (asCleanString(raw.stream) || 'Science (Integrated)').slice(0, 60),
    enrollmentAY,
    progressionAY,
    recordedInAY,
    targetClass,
    amount,
    allocatedToXI,
    allocatedToXII,
    paymentDate: (asCleanString(raw.paymentDate) || '01/04/2026').slice(0, 30),
    paymentMode,
    referenceNo: asCleanString(raw.referenceNo).slice(0, 80),
    receiptNo: (
      asCleanString(raw.receiptNo) || `SF-${Date.now().toString().slice(-6)}`
    ).slice(0, 50),
    installmentLabel: (
      asCleanString(raw.installmentLabel) || 'Integrated Science Fee'
    ).slice(0, 80),
    notes: asCleanString(raw.notes).slice(0, 300),
    fineAmount,
    receiptStatus: raw.receiptStatus === 'reversed' ? 'reversed' : 'active',
  };

  const cleanReversedAt = asCleanString(raw.reversedAt);
  if (cleanReversedAt) {
    sanitized.reversedAt = cleanReversedAt.slice(0, 40);
  }
  const cleanReversalReason = asCleanString(raw.reversalReason);
  if (cleanReversalReason) {
    sanitized.reversalReason = cleanReversalReason.slice(0, 200);
  }

  return sanitized;
}

/**
 * Returns the 143 real students and payment records from the user's Integrated Fees Register JSON.
 */
export function createInitialSeedData(ownerId: string): {
  students: StudentRecord[];
  payments: PaymentRecord[];
} {
  return buildRealRegisterRecords(ownerId);
}

export const DEFAULT_STATUS_LABELS: Record<RegisterStatusCategory, string> = {
  'Full Paid': 'Full Paid',
  'Only XI Paid': 'Only XI Paid',
  'XII Pending': 'XII Pending',
  'XII Will Pay June 26': 'XII Will Pay June 26',
  'Direct XII Paid': 'Direct XII Paid',
  'Partial Paid (₹5k Due)': 'Partial-Paid',
  'Fee Pending': 'Fee Pending',
  'Admission Cancelled': 'Admission Cancelled',
};

export function buildDefaultBatchHead(enrollmentAY: string): BatchHeadItem {
  const safeAY = BlueprintConstraints.AY_PATTERN.test(enrollmentAY.trim())
    ? enrollmentAY.trim()
    : '2026-27';
  const progressionAY = getNextAcademicYear(safeAY);
  return {
    id: `batch_${safeAY.replace(/[^0-9]/g, '_')}`,
    enrollmentAY: safeAY,
    progressionAY,
    batchTitle: `Batch ${safeAY}`,
    classXIHeadName: `Class XI - Batch ${safeAY}`,
    classXIIHeadName: `Class XII - Batch ${safeAY}`,
  };
}

export function buildDefaultHeaderConfig(availableAYs: string[]): HeaderConfig {
  const uniqueAYs = Array.from(
    new Set(['2025-26', '2026-27', ...availableAYs])
  )
    .filter((ay) => BlueprintConstraints.AY_PATTERN.test(ay))
    .sort(compareAcademicYears);

  return {
    batchHeads: uniqueAYs.map(buildDefaultBatchHead),
    year1HeadName: '1st Year — Class XI Integrated',
    year1ShortLabel: '1st Year (Class XI)',
    year2HeadName: '2nd Year — Class XII Integrated',
    year2ShortLabel: '2nd Year (Class XII)',
    combinedHeadName: '1st + 2nd Year Combined (XI & XII Full)',
    customFeeHeads: [],
    statusLabels: { ...DEFAULT_STATUS_LABELS },
    officeCopyLabel: 'OFFICE / SCHOOL COPY',
    parentCopyLabel: 'PARENT / STUDENT COPY',
    receiptSubtitle: 'Official Integrated Science Fee Receipt',
  };
}

export function normalizeHeaderConfig(
  raw: Partial<HeaderConfig> | undefined,
  availableAYs: string[]
): HeaderConfig {
  const defaults = buildDefaultHeaderConfig(availableAYs);
  if (!raw || typeof raw !== 'object') return defaults;

  const existingHeads = Array.isArray(raw.batchHeads)
    ? raw.batchHeads.filter(
        (b): b is BatchHeadItem =>
          Boolean(b && typeof b.enrollmentAY === 'string' && b.enrollmentAY)
      )
    : [];

  const byAY = new Map<string, BatchHeadItem>();
  existingHeads.forEach((b) => {
    byAY.set(b.enrollmentAY, {
      id: b.id || `batch_${b.enrollmentAY.replace(/[^0-9]/g, '_')}`,
      enrollmentAY: b.enrollmentAY,
      progressionAY: b.progressionAY || getNextAcademicYear(b.enrollmentAY),
      batchTitle: b.batchTitle || `Batch ${b.enrollmentAY}`,
      classXIHeadName: b.classXIHeadName || `Class XI - Batch ${b.enrollmentAY}`,
      classXIIHeadName:
        b.classXIIHeadName || `Class XII - Batch ${b.enrollmentAY}`,
    });
  });

  availableAYs.forEach((ay) => {
    if (BlueprintConstraints.AY_PATTERN.test(ay) && !byAY.has(ay)) {
      byAY.set(ay, buildDefaultBatchHead(ay));
    }
  });

  const mergedBatchHeads = Array.from(byAY.values()).sort((a, b) =>
    compareAcademicYears(a.enrollmentAY, b.enrollmentAY)
  );

  return {
    batchHeads:
      mergedBatchHeads.length > 0 ? mergedBatchHeads : defaults.batchHeads,
    year1HeadName: (raw.year1HeadName || '').trim() || defaults.year1HeadName,
    year1ShortLabel:
      (raw.year1ShortLabel || '').trim() || defaults.year1ShortLabel,
    year2HeadName: (raw.year2HeadName || '').trim() || defaults.year2HeadName,
    year2ShortLabel:
      (raw.year2ShortLabel || '').trim() || defaults.year2ShortLabel,
    combinedHeadName:
      (raw.combinedHeadName || '').trim() || defaults.combinedHeadName,
    customFeeHeads: Array.isArray(raw.customFeeHeads)
      ? raw.customFeeHeads
      : [],
    statusLabels: {
      ...DEFAULT_STATUS_LABELS,
      ...(raw.statusLabels || {}),
      'Partial Paid (₹5k Due)':
        !raw.statusLabels?.['Partial Paid (₹5k Due)'] ||
        raw.statusLabels['Partial Paid (₹5k Due)'] === 'Partial Paid (₹5k Due)'
          ? 'Partial-Paid'
          : raw.statusLabels['Partial Paid (₹5k Due)'],
    },
    officeCopyLabel:
      (raw.officeCopyLabel || '').trim() || defaults.officeCopyLabel,
    parentCopyLabel:
      (raw.parentCopyLabel || '').trim() || defaults.parentCopyLabel,
    receiptSubtitle:
      (raw.receiptSubtitle || '').trim() || defaults.receiptSubtitle,
  };
}

export function getBatchHeadForAY(
  config: HeaderConfig,
  enrollmentAY: string
): BatchHeadItem {
  const found = config.batchHeads.find((b) => b.enrollmentAY === enrollmentAY);
  return found || buildDefaultBatchHead(enrollmentAY);
}

export function getClassHeadDisplayName(
  config: HeaderConfig,
  enrollmentAY: string,
  classLevel: ClassLevel
): string {
  const head = getBatchHeadForAY(config, enrollmentAY);
  return classLevel === 'XI' ? head.classXIHeadName : head.classXIIHeadName;
}

export function getStatusDisplayLabel(
  config: HeaderConfig,
  category: RegisterStatusCategory
): string {
  return (config.statusLabels && config.statusLabels[category]) || category;
}

/**
 * Updates a centralized Batch Head. If its Academic Year code changed (e.g. 2025-26 -> 2027-28),
 * automatically cascades the updated enrollmentAY & progressionAY across all matching students,
 * payment records, and available Academic Years.
 */
export function updateBatchHeadWithCascade(params: {
  headerConfig: HeaderConfig;
  students: StudentRecord[];
  payments: PaymentRecord[];
  availableAYs: string[];
  batchId: string;
  nextEnrollmentAY: string;
  nextBatchTitle: string;
  nextClassXIHeadName: string;
  nextClassXIIHeadName: string;
}): {
  nextHeaderConfig: HeaderConfig;
  nextStudents: StudentRecord[];
  nextPayments: PaymentRecord[];
  nextAvailableAYs: string[];
  updatedStudents: StudentRecord[];
  updatedPayments: PaymentRecord[];
  oldEnrollmentAY: string;
  newEnrollmentAY: string;
} {
  const {
    headerConfig,
    students,
    payments,
    availableAYs,
    batchId,
    nextEnrollmentAY,
    nextBatchTitle,
    nextClassXIHeadName,
    nextClassXIIHeadName,
  } = params;

  const target = headerConfig.batchHeads.find((b) => b.id === batchId);
  if (!target) {
    return {
      nextHeaderConfig: headerConfig,
      nextStudents: students,
      nextPayments: payments,
      nextAvailableAYs: availableAYs,
      updatedStudents: [],
      updatedPayments: [],
      oldEnrollmentAY: '',
      newEnrollmentAY: '',
    };
  }

  const oldAY = target.enrollmentAY;
  const oldProgAY = target.progressionAY;
  const cleanedAY = BlueprintConstraints.AY_PATTERN.test(
    nextEnrollmentAY.trim()
  )
    ? nextEnrollmentAY.trim()
    : oldAY;
  const newProgAY = getNextAcademicYear(cleanedAY);
  const yearChanged = cleanedAY !== oldAY;

  const finalBatchTitle =
    nextBatchTitle.trim() || `Batch ${cleanedAY}`;
  const finalXIHead =
    nextClassXIHeadName.trim() || `Class XI - Batch ${cleanedAY}`;
  const finalXIIHead =
    nextClassXIIHeadName.trim() || `Class XII - Batch ${cleanedAY}`;

  // Update batchHeads list (merging cleanly if cleanedAY already had an empty placeholder head)
  const updatedBatchHeads = headerConfig.batchHeads
    .filter((b) => !(yearChanged && b.id !== batchId && b.enrollmentAY === cleanedAY))
    .map((b) =>
      b.id === batchId
        ? {
            ...b,
            enrollmentAY: cleanedAY,
            progressionAY: newProgAY,
            batchTitle: finalBatchTitle,
            classXIHeadName: finalXIHead,
            classXIIHeadName: finalXIIHead,
          }
        : b
    );

  // Ensure progressionAY also has an entry in availableAYs
  const aySet = new Set(
    yearChanged
      ? availableAYs.map((y) => (y === oldAY ? cleanedAY : y))
      : availableAYs
  );
  aySet.add(cleanedAY);
  aySet.add(newProgAY);
  const nextAvailableAYs = Array.from(aySet).sort(compareAcademicYears);

  const updatedStudents: StudentRecord[] = [];
  const nextStudents = students.map((st) => {
    if (!yearChanged || st.enrollmentAY !== oldAY) return st;
    const nextCenter =
      st.centerName && st.centerName.includes(oldAY)
        ? st.centerName.replace(oldAY, cleanedAY)
        : finalBatchTitle;
    const updated: StudentRecord = {
      ...st,
      enrollmentAY: cleanedAY,
      progressionAY: newProgAY,
      centerName: nextCenter.slice(0, BlueprintConstraints.MAX_CENTER),
    };
    updatedStudents.push(updated);
    return updated;
  });

  const updatedPayments: PaymentRecord[] = [];
  const nextPayments = payments.map((p) => {
    if (!yearChanged || p.enrollmentAY !== oldAY) return p;
    const nextRecorded =
      p.recordedInAY === oldAY
        ? cleanedAY
        : p.recordedInAY === oldProgAY
        ? newProgAY
        : p.recordedInAY;
    const updated: PaymentRecord = {
      ...p,
      enrollmentAY: cleanedAY,
      progressionAY: newProgAY,
      recordedInAY: nextRecorded,
    };
    updatedPayments.push(updated);
    return updated;
  });

  const nextHeaderConfig = normalizeHeaderConfig(
    {
      ...headerConfig,
      batchHeads: updatedBatchHeads,
    },
    nextAvailableAYs
  );

  return {
    nextHeaderConfig,
    nextStudents,
    nextPayments,
    nextAvailableAYs,
    updatedStudents,
    updatedPayments,
    oldEnrollmentAY: oldAY,
    newEnrollmentAY: cleanedAY,
  };
}

/**
 * Determines whether a student's 2nd Year (Class XII) fee is already paid,
 * and specifically whether it was paid in advance during their 1st Year (enrollmentAY)
 * so that viewing their ledger in the 2nd Academic Year (e.g. 2026-27) clearly shows
 * "Paid in Advance (2025-26)" with ₹0 due.
 */
export function getYear2AdvancePaymentInfo(
  student: StudentRecord,
  payments: PaymentRecord[]
): {
  isPaid: boolean;
  paidInAdvance: boolean;
  paidInAY: string | null;
  paymentDate: string;
  receiptNo: string | null;
} {
  const { netClassXIIFee } = computeNetYearFees(
    student.classXIFee,
    student.classXIIFee,
    student.scholarshipDiscount
  );

  const isPaid = netClassXIIFee > 0 && student.paidClassXII >= netClassXIIFee;
  if (!isPaid) {
    return {
      isPaid: false,
      paidInAdvance: false,
      paidInAY: null,
      paymentDate: student.xiiPaymentDate || '-',
      receiptNo: null,
    };
  }

  const activeXiiPayments = payments.filter(
    (p) =>
      p.studentId === student.studentId &&
      isActivePayment(p) &&
      (p.allocatedToXII > 0 ||
        p.targetClass === 'XII' ||
        p.targetClass === 'INTEGRATED')
  );

  const latestXiiPayment = activeXiiPayments[0] || null;
  const progStartYear = getAcademicYearStart(student.progressionAY);
  const progCutoffISO = `${progStartYear}-04-01`;

  const dateToCheck =
    (latestXiiPayment && latestXiiPayment.paymentDate) ||
    student.xiiPaymentDate ||
    '';
  const isoDate = parseRegisterDateToISO(dateToCheck);

  const paidBeforeProgressionYear = Boolean(isoDate && isoDate < progCutoffISO);
  const recordedInFirstYear = Boolean(
    latestXiiPayment &&
      latestXiiPayment.recordedInAY === student.enrollmentAY
  );
  const paidOnSameDateAsXI = Boolean(
    student.xiPaymentDate &&
      student.xiPaymentDate !== '-' &&
      student.xiiPaymentDate &&
      student.xiiPaymentDate === student.xiPaymentDate
  );

  const paidInAdvance =
    student.admissionClass !== 'XII' &&
    (recordedInFirstYear || paidBeforeProgressionYear || paidOnSameDateAsXI);

  return {
    isPaid: true,
    paidInAdvance,
    paidInAY: paidInAdvance
      ? student.enrollmentAY
      : (latestXiiPayment && latestXiiPayment.recordedInAY) ||
        student.progressionAY,
    paymentDate:
      (latestXiiPayment && latestXiiPayment.paymentDate) ||
      student.xiiPaymentDate ||
      '-',
    receiptNo: latestXiiPayment ? latestXiiPayment.receiptNo : null,
  };
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function emptyModeTotals(): Record<PaymentMode, number> {
  return {
    UPI: 0,
    Cash: 0,
    'NEFT/RTGS': 0,
    Cheque: 0,
    Card: 0,
    DD: 0,
  };
}

function getISOWeekInfo(year: number, monthIndex: number, day: number): {
  weekStartISO: string;
  weekEndISO: string;
  label: string;
  sublabel: string;
} {
  const utcDate = new Date(Date.UTC(year, monthIndex, day));
  const dayOfWeek = utcDate.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(utcDate);
  monday.setUTCDate(utcDate.getUTCDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  // ISO week number (Thursday of the same week determines ISO year)
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(
    ((thursday.getTime() - jan1.getTime()) / 86400000 + 1) / 7
  );

  const pad = (n: number) => String(n).padStart(2, '0');
  const startISO = `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
  const endISO = `${sunday.getUTCFullYear()}-${pad(sunday.getUTCMonth() + 1)}-${pad(sunday.getUTCDate())}`;

  const startStr = `${pad(monday.getUTCDate())} ${SHORT_MONTHS[monday.getUTCMonth()]}`;
  const endStr = `${pad(sunday.getUTCDate())} ${SHORT_MONTHS[sunday.getUTCMonth()]} ${sunday.getUTCFullYear()}`;

  return {
    weekStartISO: startISO,
    weekEndISO: endISO,
    label: `${startStr} – ${endStr}`,
    sublabel: `Week ${String(weekNo).padStart(2, '0')} · ${isoYear}`,
  };
}

function getPeriodBucketMeta(
  isoDate: string,
  period: CollectionPeriodType
): { key: string; label: string; sublabel: string; sortKey: string } {
  const [yStr, mStr, dStr] = isoDate.split('-');
  const year = Number(yStr);
  const month = Number(mStr); // 1..12
  const day = Number(dStr);
  const monthIdx = Math.max(0, Math.min(11, month - 1));

  if (period === 'daily') {
    const dt = new Date(Date.UTC(year, monthIdx, day));
    const dow = SHORT_DAYS[dt.getUTCDay()];
    return {
      key: isoDate,
      label: `${String(day).padStart(2, '0')} ${SHORT_MONTHS[monthIdx]} ${year}`,
      sublabel: `${dow} · Daily Register`,
      sortKey: isoDate,
    };
  }

  if (period === 'weekly') {
    const wk = getISOWeekInfo(year, monthIdx, day);
    return {
      key: `W_${wk.weekStartISO}`,
      label: wk.label,
      sublabel: wk.sublabel,
      sortKey: wk.weekStartISO,
    };
  }

  if (period === 'monthly') {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return {
      key,
      label: `${FULL_MONTHS[monthIdx]} ${year}`,
      sublabel: `Monthly Total`,
      sortKey: key,
    };
  }

  // Indian Financial / Academic Quarter (Q1: Apr–Jun, Q2: Jul–Sep, Q3: Oct–Dec, Q4: Jan–Mar)
  let qNum: number;
  let qMonths: string;
  let fyStartYear: number;
  if (month >= 4 && month <= 6) {
    qNum = 1;
    qMonths = `Apr – Jun ${year}`;
    fyStartYear = year;
  } else if (month >= 7 && month <= 9) {
    qNum = 2;
    qMonths = `Jul – Sep ${year}`;
    fyStartYear = year;
  } else if (month >= 10 && month <= 12) {
    qNum = 3;
    qMonths = `Oct – Dec ${year}`;
    fyStartYear = year;
  } else {
    qNum = 4;
    qMonths = `Jan – Mar ${year}`;
    fyStartYear = year - 1;
  }
  const fyLabel = `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`;

  return {
    key: `${fyStartYear}-Q${qNum}`,
    label: `Q${qNum} (${qMonths})`,
    sublabel: fyLabel,
    sortKey: `${fyStartYear}-${qNum}`,
  };
}

export function formatISODateLabel(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [yStr, mStr, dStr] = isoDate.split('-');
  const monthIdx = Math.max(0, Math.min(11, Number(mStr) - 1));
  return `${dStr} ${SHORT_MONTHS[monthIdx]} ${yStr}`;
}

/**
 * Aggregates active (non-reversed) payments into Daily, Weekly, Monthly, or Quarterly buckets,
 * sorted newest period first, with optional date/date-range filtering, XI/XII split, fine totals,
 * mode totals, and drilldown receipts.
 */
export function aggregateCollectionByPeriod(
  payments: PaymentRecord[],
  period: CollectionPeriodType,
  options?: {
    sessionAY?: string; // 'ALL' or '2025-26' etc.
    modeFilter?: 'ALL' | PaymentMode;
    fromDateISO?: string | null; // YYYY-MM-DD inclusive
    toDateISO?: string | null; // YYYY-MM-DD inclusive
  }
): PeriodCollectionReport {
  const sessionAY = options?.sessionAY || 'ALL';
  const modeFilter = options?.modeFilter || 'ALL';

  let fromISO =
    options?.fromDateISO && /^\d{4}-\d{2}-\d{2}$/.test(options.fromDateISO)
      ? options.fromDateISO
      : null;
  let toISO =
    options?.toDateISO && /^\d{4}-\d{2}-\d{2}$/.test(options.toDateISO)
      ? options.toDateISO
      : null;

  if (fromISO && toISO && fromISO > toISO) {
    const tmp = fromISO;
    fromISO = toISO;
    toISO = tmp;
  }

  const bucketMap = new Map<
    string,
    {
      meta: { key: string; label: string; sublabel: string; sortKey: string };
      studentIds: Set<string>;
      xiTotal: number;
      xiiTotal: number;
      tuitionTotal: number;
      fineTotal: number;
      grandTotal: number;
      byMode: Record<PaymentMode, number>;
      receipts: PaymentRecord[];
    }
  >();

  const overallStudents = new Set<string>();
  const overallByMode = emptyModeTotals();
  const allMatchingReceipts: PaymentRecord[] = [];
  let xiTotal = 0;
  let xiiTotal = 0;
  let tuitionTotal = 0;
  let fineTotal = 0;

  payments.forEach((p) => {
    if (!isActivePayment(p)) return;
    if (sessionAY !== 'ALL' && p.recordedInAY !== sessionAY && p.enrollmentAY !== sessionAY) {
      return;
    }
    if (modeFilter !== 'ALL' && p.paymentMode !== modeFilter) {
      return;
    }

    const iso = parseRegisterDateToISO(p.paymentDate);
    if (fromISO || toISO) {
      if (!iso) return;
      if (fromISO && iso < fromISO) return;
      if (toISO && iso > toISO) return;
    }

    const meta = iso
      ? getPeriodBucketMeta(iso, period)
      : {
          key: 'UNSCHEDULED',
          label: 'Undated / Opening Register',
          sublabel: 'Date not specified',
          sortKey: '0000-00-00',
        };

    const tuition = Math.max(0, Number(p.amount) || 0);
    const fine = Math.max(0, Number(p.fineAmount) || 0);
    const total = tuition + fine;
    const allocXI = Math.max(0, Number(p.allocatedToXI) || 0);
    const allocXII = Math.max(0, Number(p.allocatedToXII) || 0);

    let entry = bucketMap.get(meta.key);
    if (!entry) {
      entry = {
        meta,
        studentIds: new Set<string>(),
        xiTotal: 0,
        xiiTotal: 0,
        tuitionTotal: 0,
        fineTotal: 0,
        grandTotal: 0,
        byMode: emptyModeTotals(),
        receipts: [],
      };
      bucketMap.set(meta.key, entry);
    }

    entry.studentIds.add(p.studentId);
    entry.xiTotal += allocXI;
    entry.xiiTotal += allocXII;
    entry.tuitionTotal += tuition;
    entry.fineTotal += fine;
    entry.grandTotal += total;
    entry.byMode[p.paymentMode] = (entry.byMode[p.paymentMode] || 0) + total;
    entry.receipts.push(p);

    overallStudents.add(p.studentId);
    overallByMode[p.paymentMode] = (overallByMode[p.paymentMode] || 0) + total;
    xiTotal += allocXI;
    xiiTotal += allocXII;
    tuitionTotal += tuition;
    fineTotal += fine;
    allMatchingReceipts.push(p);
  });

  const sortReceiptsNewest = (a: PaymentRecord, b: PaymentRecord) => {
    const isoA = parseRegisterDateToISO(a.paymentDate) || '';
    const isoB = parseRegisterDateToISO(b.paymentDate) || '';
    return isoB.localeCompare(isoA) || b.receiptNo.localeCompare(a.receiptNo);
  };

  allMatchingReceipts.sort(sortReceiptsNewest);

  const buckets: PeriodCollectionBucket[] = Array.from(bucketMap.values())
    .sort((a, b) => b.meta.sortKey.localeCompare(a.meta.sortKey))
    .map((b) => ({
      key: b.meta.key,
      label: b.meta.label,
      sublabel: b.meta.sublabel,
      sortKey: b.meta.sortKey,
      receiptCount: b.receipts.length,
      uniqueStudentCount: b.studentIds.size,
      xiTotal: b.xiTotal,
      xiiTotal: b.xiiTotal,
      tuitionTotal: b.tuitionTotal,
      fineTotal: b.fineTotal,
      grandTotal: b.grandTotal,
      byMode: b.byMode,
      receipts: [...b.receipts].sort(sortReceiptsNewest),
    }));

  return {
    period,
    buckets,
    totalReceipts: allMatchingReceipts.length,
    totalUniqueStudents: overallStudents.size,
    xiTotal,
    xiiTotal,
    tuitionTotal,
    fineTotal,
    grandTotal: tuitionTotal + fineTotal,
    byMode: overallByMode,
    allMatchingReceipts,
  };
}


