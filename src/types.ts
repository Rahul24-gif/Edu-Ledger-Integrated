export type ClassLevel = 'XI' | 'XII';
export type AllocationTarget = 'XI' | 'XII' | 'INTEGRATED';
export type PaymentMode = 'UPI' | 'NEFT/RTGS' | 'Cheque' | 'Cash' | 'Card' | 'DD';
export type StudentStatus = 'active' | 'completed' | 'dropped';

/**
 * The 8 Status Categories from the user's Integrated Fees Register Excel sheet
 */
export type RegisterStatusCategory =
  | 'Full Paid'
  | 'Only XI Paid'
  | 'XII Pending'
  | 'XII Will Pay June 26'
  | 'Direct XII Paid'
  | 'Partial Paid (₹5k Due)'
  | 'Fee Pending'
  | 'Admission Cancelled';

export interface StudentRecord {
  studentId: string;
  ownerId: string;
  rollNo: string;
  fullName: string;
  fatherName: string;
  phone: string;
  stream: string;
  centerName: string;
  /**
   * The Academic Year in which the student enrolled in Class XI (e.g., "2025-26" or "2026-27").
   */
  enrollmentAY: string;
  /**
   * The consecutive Academic Year in which the student automatically progresses to Class XII (e.g., "2026-27" or "2027-28").
   */
  progressionAY: string;
  admissionClass: ClassLevel;
  classXIFee: number;
  classXIIFee: number;
  scholarshipDiscount: number;
  totalIntegratedFee: number;
  paidClassXI: number;
  paidClassXII: number;
  totalPaid: number;
  /**
   * Exact Class XI payment date from the Integrated Fees Register (e.g., "24/05/2025", "May 2025", "-")
   */
  xiPaymentDate: string;
  /**
   * Exact Class XII payment date from the Integrated Fees Register (e.g., "04/04/2026", "-")
   */
  xiiPaymentDate: string;
  status: StudentStatus;
  /**
   * Exact Remark / Status Category from the Integrated Fees Register
   * (e.g. "Full Paid", "Only XI Paid", "XII Pending", "XII Will Pay June 26",
   *  "Direct XII Paid", "Partial Paid (₹5k Due)", "Fee Pending", "Admission Cancelled")
   */
  remarks: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ReceiptLifecycleStatus = 'active' | 'reversed';

export interface PaymentRecord {
  paymentId: string;
  studentId: string;
  ownerId: string;
  studentName: string;
  rollNo: string;
  stream: string;
  enrollmentAY: string;
  progressionAY: string;
  recordedInAY: string;
  targetClass: AllocationTarget;
  amount: number;
  allocatedToXI: number;
  allocatedToXII: number;
  paymentDate: string;
  paymentMode: PaymentMode;
  referenceNo: string;
  receiptNo: string;
  installmentLabel: string;
  notes: string;
  fineAmount?: number;
  receiptStatus?: ReceiptLifecycleStatus;
  reversedAt?: string;
  reversalReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FeeStructureSettings {
  schoolDisplayName: string;
  classXIDefaultFee: number;
  classXIIDefaultFee: number;
  receiptPrefix: string;
}

export const DEFAULT_FEE_STRUCTURE_SETTINGS: FeeStructureSettings = {
  schoolDisplayName: 'SciFee — Integrated Science Program',
  classXIDefaultFee: 10000,
  classXIIDefaultFee: 10000,
  receiptPrefix: 'SF',
};

export interface ImportConflictRow {
  incoming: Omit<StudentRecord, 'createdAt' | 'updatedAt'>;
  matchType: 'new' | 'duplicate_ec' | 'duplicate_name';
  existingStudent?: StudentRecord;
  missingPhone: boolean;
}

export interface BatchHeadItem {
  id: string;
  enrollmentAY: string;
  progressionAY: string;
  batchTitle: string;
  classXIHeadName: string;
  classXIIHeadName: string;
}

export interface CustomFeeHead {
  id: string;
  code: string;
  name: string;
  applicableTo: '1st Year (XI)' | '2nd Year (XII)' | 'Both Years (XI + XII)';
  defaultAmount: number;
}

export interface HeaderConfig {
  batchHeads: BatchHeadItem[];
  year1HeadName: string;
  year1ShortLabel: string;
  year2HeadName: string;
  year2ShortLabel: string;
  combinedHeadName: string;
  customFeeHeads: CustomFeeHead[];
  statusLabels: Record<RegisterStatusCategory, string>;
  officeCopyLabel: string;
  parentCopyLabel: string;
  receiptSubtitle: string;
}

export interface WorkspaceBackupPayload {
  version: number;
  exportedAt: string;
  availableAYs: string[];
  feeSettings: FeeStructureSettings;
  headerConfig?: HeaderConfig;
  students: StudentRecord[];
  payments: PaymentRecord[];
}

export type CollectionPeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface PeriodCollectionBucket {
  key: string;
  label: string;
  sublabel: string;
  sortKey: string;
  receiptCount: number;
  uniqueStudentCount: number;
  xiTotal: number;
  xiiTotal: number;
  tuitionTotal: number;
  fineTotal: number;
  grandTotal: number;
  byMode: Record<PaymentMode, number>;
  receipts: PaymentRecord[];
}

export interface PeriodCollectionReport {
  period: CollectionPeriodType;
  buckets: PeriodCollectionBucket[];
  totalReceipts: number;
  totalUniqueStudents: number;
  xiTotal: number;
  xiiTotal: number;
  tuitionTotal: number;
  fineTotal: number;
  grandTotal: number;
  byMode: Record<PaymentMode, number>;
  allMatchingReceipts: PaymentRecord[];
}

/**
 * Computed view of a student within a specific selected Academic Year (e.g., 2025-26, 2026-27, 2027-28, or ALL_BATCHES).
 */
export interface StudentInAcademicYearView {
  student: StudentRecord;
  /**
   * Which class the student is studying in during the selected Academic Year ("XI" or "XII").
   */
  activeClassInSelectedAY: ClassLevel;
  /**
   * Human-readable progression badge (e.g., "Batch 2025-26 (XI) → 2026-27 (XII)").
   */
  cohortLabel: string;
  /**
   * Whether this student is in Class XII in the selected A.Y. via automatic promotion from previous A.Y. Class XI.
   */
  isPromotedFromPreviousAY: boolean;
  /**
   * Net payable for Class XI (Year 1).
   */
  netClassXIFee: number;
  /**
   * Net payable for Class XII (Year 2).
   */
  netClassXIIFee: number;
  /**
   * Remaining unpaid balance specifically for Class XI.
   */
  pendingClassXI: number;
  /**
   * Remaining unpaid balance specifically for Class XII.
   */
  pendingClassXII: number;
  /**
   * Total pending balance across the entire 2-year Integrated course.
   */
  totalPendingIntegrated: number;
  /**
   * Fee payment status for the active class and overall integrated package.
   */
  overallPaymentStatus: 'FULLY_PAID' | 'PARTIAL' | 'NO_PAYMENT';
  activeClassPaymentStatus: 'FULLY_PAID' | 'PARTIAL' | 'NO_PAYMENT';
  /**
   * Percentage of total integrated fee paid (0 - 100).
   */
  integratedProgressPercent: number;
  /**
   * Computed dynamic status category matching the Excel register formulas.
   */
  registerCategory: RegisterStatusCategory;
}

export const STREAM_OPTIONS = [
  'Science (Integrated)',
  'JEE Main + Adv (PCM)',
  'NEET UG (PCB)',
  'MHT-CET Integrated (PCM/PCB)',
] as const;

export const REGISTER_STATUS_CATEGORIES: {
  category: RegisterStatusCategory;
  description: string;
}[] = [
  {
    category: 'Full Paid',
    description: 'Dono saal (XI + XII) ka complete payment ho chuka hai (₹20,000)',
  },
  {
    category: 'Only XI Paid',
    description: 'Current batch (26-27) ke students, XII fees agle saal due hogi (₹10,000)',
  },
  {
    category: 'XII Pending',
    description: 'Last year batch (25-26) ke students, XI Paid hai, XII fees follow-up baaki hai',
  },
  {
    category: 'XII Will Pay June 26',
    description: 'Atharv Kesarwani (June 2026 me Class XII fee payment promised)',
  },
  {
    category: 'Direct XII Paid',
    description: 'Vihan Varma & Bijesh Prathapani (Direct Class XII admission)',
  },
  {
    category: 'Partial Paid (₹5k Due)',
    description: 'Ayushi Epilli (XI ka ₹5,000 balance lena baaki hai)',
  },
  {
    category: 'Fee Pending',
    description: 'Roster students jinka intermediate register me record nahi hai (₹0 Paid)',
  },
  {
    category: 'Admission Cancelled',
    description: 'Chinmay Dhenge (05/07/2025 ko admission cancel hua)',
  },
];

export const DEFAULT_ACADEMIC_YEARS = [
  '2025-26',
  '2026-27',
  '2027-28',
  '2028-29',
] as const;

export const BlueprintConstraints = {
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  AY_PATTERN: /^[0-9]{4}-[0-9]{2,4}$/,
  MAX_ROLL_NO: 40,
  MAX_NAME: 120,
  MAX_PHONE: 30,
  MAX_STREAM: 60,
  MAX_CENTER: 80,
  MAX_REMARKS: 500,
  MAX_DATE_STR: 40,
  MAX_FEE: 10000000,
  MAX_TOTAL_FEE: 20000000,
  MAX_REF_NO: 80,
  MAX_RECEIPT_NO: 50,
  MAX_INSTALLMENT_LABEL: 80,
  MAX_NOTES: 300,
};
