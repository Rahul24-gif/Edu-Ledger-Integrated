import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Filter,
  PlusCircle,
  Printer,
  Search,
  TrendingUp,
} from 'lucide-react';
import {
  ClassLevel,
  FeeStructureSettings,
  HeaderConfig,
  PaymentMode,
  PaymentRecord,
  REGISTER_STATUS_CATEGORIES,
  RegisterStatusCategory,
  StudentRecord,
} from '../types';
import {
  aggregateCashbook,
  compareAcademicYears,
  computeDynamicRegisterCategory,
  computeNetYearFees,
  formatINR,
  getBatchHeadForAY,
  getStatusDisplayLabel,
  getYear2AdvancePaymentInfo,
  isClassXIIDueInAY,
  isPlaceholderPhone,
  isStudentDueInAY,
  resolveStudentInAcademicYear,
} from '../utils/ledgerLogic';
import {
  exportCashbookToExcel,
  exportFormattedReportToExcel,
  formatSafeCsvCell,
  sanitizeDownloadFilenamePart,
} from '../utils/excelUtils';

interface ReportsSectionProps {
  students: StudentRecord[];
  payments: PaymentRecord[];
  selectedAY: string;
  availableAYs: string[];
  headerConfig: HeaderConfig;
  feeSettings?: FeeStructureSettings;
  onSwitchAY: (ay: string) => void;
  onOpenRecordPayment: (student: StudentRecord) => void;
  onOpenStudentLedger: (student: StudentRecord) => void;
}

const PAYMENT_MODES: PaymentMode[] = [
  'UPI',
  'Cash',
  'NEFT/RTGS',
  'Cheque',
  'Card',
  'DD',
];

function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function getOffsetDaysISO(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function getMonthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export const ReportsSection: React.FC<ReportsSectionProps> = ({
  students,
  payments,
  selectedAY,
  availableAYs,
  headerConfig,
  feeSettings,
  onOpenStudentLedger,
}) => {
  const [reportTab, setReportTab] = useState<
    | 'daily_cashbook'
    | 'pending_recovery'
    | 'executive_summary'
    | 'custom_extractor'
  >('daily_cashbook');

  // Daily Cashbook Filter State (default All Time so real register payments are visible immediately; 1-click Today/Week/Month presets)
  const [cashbookPreset, setCashbookPreset] = useState<
    'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'
  >('ALL');
  const [cashbookFromISO, setCashbookFromISO] = useState<string>('');
  const [cashbookToISO, setCashbookToISO] = useState<string>('');
  const [cashbookModeFilter, setCashbookModeFilter] = useState<
    'ALL' | PaymentMode
  >('ALL');

  // Pending Recovery Filter State (multi-batch)
  const [pendingBatchFilter, setPendingBatchFilter] = useState<string>('ALL');

  // Custom Extractor Filter State
  const [reportScopeAY, setReportScopeAY] = useState<string>('ALL_BATCHES');
  const [classFilter, setClassFilter] = useState<'ALL' | ClassLevel>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<
    'ALL' | RegisterStatusCategory
  >('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);

  const applyCashbookPreset = (preset: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH') => {
    setCashbookPreset(preset);
    if (preset === 'ALL') {
      setCashbookFromISO('');
      setCashbookToISO('');
    } else if (preset === 'TODAY') {
      const t = getTodayISO();
      setCashbookFromISO(t);
      setCashbookToISO(t);
    } else if (preset === 'WEEK') {
      setCashbookFromISO(getOffsetDaysISO(6));
      setCashbookToISO(getTodayISO());
    } else if (preset === 'MONTH') {
      setCashbookFromISO(getMonthStartISO());
      setCashbookToISO(getTodayISO());
    }
  };

  // Daily Cashbook Aggregation
  const cashbookSummary = useMemo(
    () =>
      aggregateCashbook(
        payments,
        cashbookFromISO,
        cashbookToISO,
        cashbookModeFilter
      ),
    [payments, cashbookFromISO, cashbookToISO, cashbookModeFilter]
  );

  const cashbookRangeLabel = useMemo(() => {
    if (!cashbookFromISO && !cashbookToISO) return 'All_Time';
    if (cashbookFromISO === cashbookToISO) return cashbookFromISO;
    return `${cashbookFromISO || 'Start'}_to_${cashbookToISO || 'Now'}`;
  }, [cashbookFromISO, cashbookToISO]);

  // Dynamic sorted batches present across all students
  const allDynamicBatches = useMemo(() => {
    return Array.from(new Set(students.map((s) => s.enrollmentAY)))
      .filter((ay) => /^\d{4}-\d{2,4}$/.test(ay))
      .sort();
  }, [students]);

  const handleCopyReminder = (
    student: StudentRecord,
    pendingAmount: number
  ) => {
    const dueTarget =
      student.paidClassXI < student.classXIFee
        ? `Class XI (${student.enrollmentAY})`
        : `Class XII (${student.progressionAY})`;
    const message = `Dear Parent of ${student.fullName} (EC No: ${student.rollNo}, Batch ${student.enrollmentAY}), your Integrated Science Fee balance of ${formatINR(pendingAmount)} for ${dueTarget} is currently pending. Kindly clear the dues at the earliest. Thank you.`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(message).catch(() => {});
    }
    setCopiedStudentId(student.studentId);
    window.setTimeout(() => {
      setCopiedStudentId((prev) => (prev === student.studentId ? null : prev));
    }, 2500);
  };

  // Dynamic Formula-Based Executive Summary Table (supports any number of batches)
  const executiveSummaryRows = useMemo(() => {
    return REGISTER_STATUS_CATEGORIES.map((item, idx) => {
      const matching = students.filter(
        (s) => computeDynamicRegisterCategory(s, selectedAY) === item.category
      );
      const countsByBatch: Record<string, number> = {};
      allDynamicBatches.forEach((b) => {
        countsByBatch[b] = matching.filter((s) => s.enrollmentAY === b).length;
      });
      const totalCount = matching.length;
      const xiPaidSum = matching.reduce((acc, s) => acc + s.paidClassXI, 0);
      const xiiPaidSum = matching.reduce((acc, s) => acc + s.paidClassXII, 0);
      const totalPaidSum = matching.reduce((acc, s) => acc + s.totalPaid, 0);

      return {
        sr: idx + 1,
        category: item.category,
        description: item.description,
        countsByBatch,
        totalCount,
        xiPaidSum,
        xiiPaidSum,
        totalPaidSum,
      };
    });
  }, [students, selectedAY, allDynamicBatches]);

  const executiveGrandTotals = useMemo(() => {
    const countsByBatch: Record<string, number> = {};
    allDynamicBatches.forEach((b) => {
      countsByBatch[b] = 0;
    });
    return executiveSummaryRows.reduce(
      (acc, r) => {
        allDynamicBatches.forEach((b) => {
          acc.countsByBatch[b] += r.countsByBatch[b] || 0;
        });
        acc.totalCount += r.totalCount;
        acc.xiPaidSum += r.xiPaidSum;
        acc.xiiPaidSum += r.xiiPaidSum;
        acc.totalPaidSum += r.totalPaidSum;
        return acc;
      },
      {
        countsByBatch,
        totalCount: 0,
        xiPaidSum: 0,
        xiiPaidSum: 0,
        totalPaidSum: 0,
      }
    );
  }, [executiveSummaryRows, allDynamicBatches]);

  // Multi-Batch Pending Recovery & Follow-Up List (includes ALL batches with active dues in selectedAY)
  const allPendingRecoveryRows = useMemo(() => {
    return students
      .filter((s) => isStudentDueInAY(s, selectedAY))
      .map((s) => {
        const { netClassXIFee, netClassXIIFee, totalIntegratedFee } =
          computeNetYearFees(
            s.classXIFee,
            s.classXIIFee,
            s.scholarshipDiscount
          );
        const xiStatus =
          netClassXIFee === 0
            ? 'Direct XII'
            : s.paidClassXI >= netClassXIFee
            ? `Paid (${formatINR(s.paidClassXI)})`
            : s.paidClassXI > 0
            ? `Partial-Paid (${formatINR(s.paidClassXI)})`
            : 'Pending (₹0)';

        const xiiDue = isClassXIIDueInAY(s, selectedAY);
        const y2Info = getYear2AdvancePaymentInfo(s, payments);
        const xiiStatus =
          netClassXIIFee === 0
            ? 'N/A'
            : y2Info.isPaid
            ? y2Info.paidInAdvance && y2Info.paidInAY
              ? `Paid (Adv. ${y2Info.paidInAY})`
              : `Paid (${formatINR(s.paidClassXII)})`
            : s.paidClassXII > 0
            ? `Partial-Paid (${formatINR(s.paidClassXII)})`
            : xiiDue
            ? `Pending (${formatINR(s.paidClassXII)})`
            : `Upcoming (${s.progressionAY})`;

        // Actionable pending due in selectedAY
        const xiPending = Math.max(0, netClassXIFee - s.paidClassXI);
        const xiiPending =
          xiiDue || s.paidClassXII > 0
            ? Math.max(0, netClassXIIFee - s.paidClassXII)
            : 0;
        const actionableDue = Math.max(
          xiPending + xiiPending,
          s.totalPaid === 0 ? Math.max(netClassXIFee, totalIntegratedFee) : 0
        );

        return {
          student: s,
          xiStatus,
          xiiStatus,
          pendingAmount: actionableDue,
          totalIntegratedPending: Math.max(0, totalIntegratedFee - s.totalPaid),
          category: computeDynamicRegisterCategory(s, selectedAY),
        };
      });
  }, [students, payments, selectedAY]);

  const filteredPendingRecoveryRows = useMemo(() => {
    const list =
      pendingBatchFilter === 'ALL'
        ? allPendingRecoveryRows
        : allPendingRecoveryRows.filter(
            (r) => r.student.enrollmentAY === pendingBatchFilter
          );
    return list.map((r, idx) => ({ ...r, srNo: idx + 1 }));
  }, [allPendingRecoveryRows, pendingBatchFilter]);

  const totalPendingDueNow = useMemo(
    () =>
      filteredPendingRecoveryRows.reduce((s, r) => s + r.pendingAmount, 0),
    [filteredPendingRecoveryRows]
  );

  const fullPaidCount = useMemo(
    () =>
      students.filter((s) => {
        const c = computeDynamicRegisterCategory(s, selectedAY);
        return c === 'Full Paid' || c === 'Direct XII Paid';
      }).length,
    [students, selectedAY]
  );

  const totalPayableOverall = useMemo(
    () => students.reduce((sum, s) => sum + s.totalIntegratedFee, 0),
    [students]
  );

  const collectionPctOverall =
    totalPayableOverall > 0
      ? Math.round(
          (executiveGrandTotals.totalPaidSum / totalPayableOverall) * 100
        )
      : 0;

  const pendingSharePct =
    totalPayableOverall > 0
      ? Math.round((totalPendingDueNow / totalPayableOverall) * 100)
      : 0;

  // Filtered rows for Custom Extractor & Excel Report Export
  // When scope is ALL_BATCHES, classify each student's active class relative to the current selectedAY
  // so promoted batches (e.g. Batch 2025-26 in 2026-27) cleanly land in Class XII while current intake lands in Class XI.
  const reportRows = useMemo(() => {
    const resolved = students
      .map((student) => {
        if (reportScopeAY === 'ALL_BATCHES') {
          const inCurrentAY = resolveStudentInAcademicYear(student, selectedAY);
          if (inCurrentAY) return inCurrentAY;
          const fallback = resolveStudentInAcademicYear(student, 'ALL_BATCHES');
          if (!fallback) return null;
          const promotedClass: ClassLevel =
            student.admissionClass === 'XII' ||
            compareAcademicYears(selectedAY, student.progressionAY) >= 0
              ? 'XII'
              : 'XI';
          return {
            ...fallback,
            activeClassInSelectedAY: promotedClass,
            isPromotedFromPreviousAY:
              promotedClass === 'XII' && student.admissionClass === 'XI',
          };
        }
        return resolveStudentInAcademicYear(student, reportScopeAY);
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return resolved.filter((row) => {
      if (
        classFilter !== 'ALL' &&
        row.activeClassInSelectedAY !== classFilter
      ) {
        return false;
      }
      if (
        categoryFilter !== 'ALL' &&
        row.registerCategory !== categoryFilter
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = row.student.fullName.toLowerCase().includes(q);
        const matchRoll = row.student.rollNo.toLowerCase().includes(q);
        const matchBatch = row.student.centerName.toLowerCase().includes(q);
        const matchRem = row.registerCategory.toLowerCase().includes(q);
        if (!matchName && !matchRoll && !matchBatch && !matchRem) {
          return false;
        }
      }
      return true;
    });
  }, [students, reportScopeAY, selectedAY, classFilter, categoryFilter, searchQuery]);

  const handleExportFormattedExcel = async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    try {
      const exportScope =
        reportScopeAY === 'ALL_BATCHES' ? selectedAY : reportScopeAY;
      await exportFormattedReportToExcel(reportRows, exportScope, {
        headerConfig,
        schoolDisplayName: feeSettings?.schoolDisplayName,
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const summaryMetrics = useMemo(() => {
    return reportRows.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.paidXI += r.student.paidClassXI;
        acc.paidXII += r.student.paidClassXII;
        acc.totalPaid += r.student.totalPaid;
        acc.totalPending += r.totalPendingIntegrated;
        return acc;
      },
      { count: 0, paidXI: 0, paidXII: 0, totalPaid: 0, totalPending: 0 }
    );
  }, [reportRows]);

  const handleExportRegisterCSV = () => {
    const headers = [
      'Sr. No.',
      'Student Name',
      'Batch',
      'XI Payment Date',
      'XI Payment Amount (INR)',
      'XII Payment Date',
      'XII Payment Amount (INR)',
      'Total Paid (INR)',
      'Pending Amount (INR)',
      'Remark / Status Category',
    ];

    const csvRows = reportRows.map((r, idx) => [
      idx + 1,
      formatSafeCsvCell(r.student.fullName),
      formatSafeCsvCell(`Batch ${r.student.enrollmentAY}`),
      formatSafeCsvCell(r.student.xiPaymentDate || '-'),
      r.student.paidClassXI,
      formatSafeCsvCell(r.student.xiiPaymentDate || '-'),
      r.student.paidClassXII,
      r.student.totalPaid,
      r.totalPendingIntegrated,
      formatSafeCsvCell(getStatusDisplayLabel(headerConfig, r.registerCategory)),
    ]);

    const csvString = [
      headers.map((h) => formatSafeCsvCell(h)).join(','),
      ...csvRows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeScope = sanitizeDownloadFilenamePart(reportScopeAY, 'All_Batches');
    link.download = `Integrated_Fees_Register_${safeScope}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPendingRecoveryCSV = () => {
    const headers = [
      'Sr. No.',
      'EC No.',
      'Student Name',
      'Academic Batch',
      'Class XI Status',
      'Class XII Status',
      'Due Now (INR)',
      'Remark',
    ];

    const csvRows = filteredPendingRecoveryRows.map((r) => [
      r.srNo,
      formatSafeCsvCell(r.student.rollNo),
      formatSafeCsvCell(r.student.fullName),
      formatSafeCsvCell(`Batch ${r.student.enrollmentAY}`),
      formatSafeCsvCell(r.xiStatus),
      formatSafeCsvCell(r.xiiStatus),
      r.pendingAmount,
      formatSafeCsvCell(getStatusDisplayLabel(headerConfig, r.category)),
    ]);

    const csvString = [
      headers.map((h) => formatSafeCsvCell(h)).join(','),
      ...csvRows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeAY = sanitizeDownloadFilenamePart(selectedAY, 'Session');
    const safeBatch = sanitizeDownloadFilenamePart(pendingBatchFilter, 'ALL');
    link.download = `Pending_Recovery_${safeAY}_${safeBatch}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* TOP HEADER & ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#3e4947]">
            Audit Cycle {selectedAY} · All {students.length} Students
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#131b2e]">
            Reports, Cashbook &amp; Pending List
          </h1>
          <p className="mt-1 text-sm text-[#3e4947] max-w-lg">
            Reconcile daily UPI/Cash/Bank receipts, track active dues across all
            batches, and export print-ready sheets.
          </p>
        </div>

        <div className="flex flex-wrap lg:flex-nowrap items-center justify-end gap-2 shrink-0 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-white text-[#131b2e] shadow-[0_1px_4px_rgba(19,27,46,0.06)] hover:bg-[#f2f3ff] transition-colors text-xs font-semibold whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5 text-[#3e4947]" />
            <span>
              {reportTab === 'daily_cashbook'
                ? 'Print Day-End Tally'
                : 'Print Report'}
            </span>
          </button>
          {reportTab === 'daily_cashbook' && (
            <button
              type="button"
              onClick={() =>
                exportCashbookToExcel(cashbookSummary, cashbookRangeLabel)
              }
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-white text-[#005c55] shadow-[0_1px_4px_rgba(19,27,46,0.06)] hover:bg-[#e6f7ef] transition-colors text-xs font-semibold whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Export Cashbook (.xlsx)</span>
            </button>
          )}
          <button
            type="button"
            disabled={isExportingExcel}
            onClick={handleExportFormattedExcel}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-[#005c55] text-white shadow-xs hover:bg-[#0f766e] disabled:opacity-60 transition-colors text-xs font-semibold whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>
              {isExportingExcel
                ? 'Preparing Print-Ready Excel...'
                : 'Export Full Report (.xlsx)'}
            </span>
          </button>
        </div>
      </div>

      {/* 3-CARD PRIMARY STAT BENTO GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Active Pending Dues (All Batches in Selected AY) */}
        <div className="rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(19,27,46,0.04)] flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium text-[#3e4947]">
                Active Dues ({selectedAY} ·{' '}
                {pendingBatchFilter === 'ALL'
                  ? 'All Batches'
                  : `Batch ${pendingBatchFilter}`}
                )
              </span>
              <div className="mt-2 font-mono text-3xl font-bold text-[#7d4200] tabular-nums">
                {formatINR(totalPendingDueNow)}
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[#ffdcc3]/60 flex items-center justify-center text-[#7d4200]">
              <AlertCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#3e4947]">
                {filteredPendingRecoveryRows.length} students due
              </span>
              <span className="font-mono font-semibold text-[#7d4200]">
                {pendingSharePct}% of total
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#eaedff] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#7d4200]"
                style={{
                  width: `${Math.min(100, Math.max(4, pendingSharePct))}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Overall Collected */}
        <div className="rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(19,27,46,0.04)] flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium text-[#3e4947]">
                Total Tuition Collected (All Batches)
              </span>
              <div className="mt-2 font-mono text-3xl font-bold text-[#006c49] tabular-nums">
                {formatINR(executiveGrandTotals.totalPaidSum)}
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[#e6f7ef] flex items-center justify-center text-[#006c49]">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#3e4947]">
                XI: {formatINR(executiveGrandTotals.xiPaidSum)} · XII:{' '}
                {formatINR(executiveGrandTotals.xiiPaidSum)}
              </span>
              <span className="font-mono font-semibold text-[#006c49]">
                {collectionPctOverall}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#eaedff] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#006c49]"
                style={{ width: `${Math.min(100, collectionPctOverall)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Clearance & Quick CSVs */}
        <div className="rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(19,27,46,0.04)] flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium text-[#3e4947]">
                Fully Cleared Ledgers
              </span>
              <div className="mt-2 font-mono text-3xl font-bold text-[#131b2e] tabular-nums">
                {fullPaidCount}
                <span className="text-base font-normal text-[#3e4947]">
                  {' '}
                  / {students.length}
                </span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[#f2f3ff] flex items-center justify-center text-[#005c55]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs pt-2 border-t border-[#f2f3ff]">
            <button
              type="button"
              onClick={handleExportPendingRecoveryCSV}
              className="inline-flex items-center gap-1 font-semibold text-[#005c55] hover:underline"
            >
              <Download className="h-3.5 w-3.5" />
              Pending CSV
            </button>
            <button
              type="button"
              onClick={handleExportRegisterCSV}
              className="inline-flex items-center gap-1 font-semibold text-[#3e4947] hover:text-[#131b2e]"
            >
              <Download className="h-3.5 w-3.5" />
              Full Register CSV
            </button>
          </div>
        </div>
      </div>

      {/* REPORT SUB-NAVIGATION TABS */}
      <div
        role="tablist"
        aria-label="Report views"
        className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-[#f2f3ff] p-1.5 w-fit no-print"
      >
        <button
          type="button"
          role="tab"
          aria-selected={reportTab === 'daily_cashbook'}
          onClick={() => setReportTab('daily_cashbook')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
            reportTab === 'daily_cashbook'
              ? 'bg-white text-[#131b2e] shadow-2xs'
              : 'text-[#3e4947] hover:text-[#131b2e]'
          }`}
        >
          <BookOpenCheck className="h-3.5 w-3.5 text-[#005c55]" />
          Daily Cashbook ({cashbookSummary.activeCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={reportTab === 'pending_recovery'}
          onClick={() => setReportTab('pending_recovery')}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
            reportTab === 'pending_recovery'
              ? 'bg-white text-[#131b2e] shadow-2xs'
              : 'text-[#3e4947] hover:text-[#131b2e]'
          }`}
        >
          Pending Recovery ({allPendingRecoveryRows.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={reportTab === 'executive_summary'}
          onClick={() => setReportTab('executive_summary')}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
            reportTab === 'executive_summary'
              ? 'bg-white text-[#131b2e] shadow-2xs'
              : 'text-[#3e4947] hover:text-[#131b2e]'
          }`}
        >
          Executive Summary (8 Categories)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={reportTab === 'custom_extractor'}
          onClick={() => setReportTab('custom_extractor')}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
            reportTab === 'custom_extractor'
              ? 'bg-white text-[#131b2e] shadow-2xs'
              : 'text-[#3e4947] hover:text-[#131b2e]'
          }`}
        >
          Custom Filter &amp; Extractor
        </button>
      </div>

      {/* TAB 1: DAILY CASHBOOK & MODE-WISE RECONCILIATION */}
      {reportTab === 'daily_cashbook' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(19,27,46,0.04)] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-[#131b2e]">
                  Daily Cashbook &amp; Mode-Wise Collection Tally
                </h2>
                <p className="text-xs text-[#3e4947] mt-0.5">
                  Verify counter Cash, UPI, NEFT/RTGS, Cheque, Card, and DD
                  collections for any date range.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 no-print">
                {(
                  [
                    { id: 'ALL', label: 'All Dates' },
                    { id: 'TODAY', label: 'Today' },
                    { id: 'WEEK', label: 'Last 7 Days' },
                    { id: 'MONTH', label: 'This Month' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyCashbookPreset(preset.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      cashbookPreset === preset.id
                        ? 'bg-[#005c55] text-white'
                        : 'bg-[#f2f3ff] text-[#3e4947] hover:text-[#131b2e]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Range & Mode Filter */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 no-print">
              <div>
                <label className="block text-[11px] font-semibold text-[#3e4947] mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  aria-label="Cashbook From Date"
                  value={cashbookFromISO}
                  onChange={(e) => {
                    setCashbookFromISO(e.target.value);
                    setCashbookPreset('CUSTOM');
                  }}
                  className="w-full rounded-xl bg-[#f2f3ff] px-3 py-2 font-mono text-xs text-[#131b2e]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#3e4947] mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  aria-label="Cashbook To Date"
                  value={cashbookToISO}
                  onChange={(e) => {
                    setCashbookToISO(e.target.value);
                    setCashbookPreset('CUSTOM');
                  }}
                  className="w-full rounded-xl bg-[#f2f3ff] px-3 py-2 font-mono text-xs text-[#131b2e]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#3e4947] mb-1">
                  Payment Mode
                </label>
                <select
                  aria-label="Filter Cashbook by Payment Mode"
                  value={cashbookModeFilter}
                  onChange={(e) =>
                    setCashbookModeFilter(
                      e.target.value as 'ALL' | PaymentMode
                    )
                  }
                  className="w-full rounded-xl bg-[#f2f3ff] px-3 py-2 text-xs font-medium text-[#131b2e]"
                >
                  <option value="ALL">All 6 Modes</option>
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mode-Wise Breakdown Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 pt-1">
              {cashbookSummary.byMode.map((item) => (
                <div
                  key={item.mode}
                  className={`rounded-xl p-3 border transition-colors ${
                    item.grandTotal > 0
                      ? 'bg-[#faf8ff] border-[#eaedff]'
                      : 'bg-white border-[#f2f3ff] opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#131b2e]">
                      {item.mode}
                    </span>
                    <span className="font-mono text-[#3e4947]">
                      {item.count}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-[#005c55] tabular-nums">
                    {formatINR(item.grandTotal)}
                  </div>
                  {item.fineTotal > 0 && (
                    <div className="text-[10px] font-mono text-[#7d4200]">
                      incl. {formatINR(item.fineTotal)} fine
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Cashbook Grand Totals Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#faf8ff] border border-[#eaedff] px-4 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                <span>
                  Tuition:{' '}
                  <strong className="text-[#131b2e]">
                    {formatINR(cashbookSummary.tuitionTotal)}
                  </strong>
                </span>
                <span>
                  Late Fine:{' '}
                  <strong className="text-[#7d4200]">
                    {formatINR(cashbookSummary.fineTotal)}
                  </strong>
                </span>
                <span>
                  Active Receipts:{' '}
                  <strong className="text-[#131b2e]">
                    {cashbookSummary.activeCount}
                  </strong>
                </span>
                {cashbookSummary.reversedCount > 0 && (
                  <span className="text-[#ba1a1a]">
                    Reversed Excluded: {cashbookSummary.reversedCount}
                  </span>
                )}
              </div>
              <div className="font-mono text-sm font-bold text-[#006c49] tabular-nums">
                Grand Total: {formatINR(cashbookSummary.grandTotal)}
              </div>
            </div>

            {/* Cashbook Receipts Table */}
            <div className="overflow-x-auto rounded-xl border border-[#f2f3ff]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#f2f3ff] bg-[#faf8ff] text-[11px] font-semibold text-[#3e4947]">
                    <th className="py-3 px-4 whitespace-nowrap">Date</th>
                    <th className="py-3 px-3 whitespace-nowrap">Receipt No.</th>
                    <th className="py-3 px-3">Student &amp; EC No.</th>
                    <th className="py-3 px-3 whitespace-nowrap">Allocation</th>
                    <th className="py-3 px-3 whitespace-nowrap">Mode</th>
                    <th className="py-3 px-3 text-right font-mono whitespace-nowrap">
                      Tuition (₹)
                    </th>
                    <th className="py-3 px-3 text-right font-mono whitespace-nowrap">
                      Fine (₹)
                    </th>
                    <th className="py-3 px-4 text-right font-mono whitespace-nowrap">
                      Total (₹)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f3ff]">
                  {cashbookSummary.matchingActiveReceipts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-10 text-center text-xs text-[#3e4947]"
                      >
                        No active fee receipts found for the selected date range
                        and mode.
                      </td>
                    </tr>
                  ) : (
                    cashbookSummary.matchingActiveReceipts
                      .slice(0, 150)
                      .map((rcp) => {
                        const fine = Math.max(0, Number(rcp.fineAmount) || 0);
                        const linkedStudent = students.find(
                          (s) => s.studentId === rcp.studentId
                        );
                        return (
                          <tr
                            key={rcp.paymentId}
                            className="hover:bg-[#faf8ff]"
                          >
                            <td className="py-2.5 px-4 font-mono whitespace-nowrap text-[#3e4947]">
                              {rcp.paymentDate}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-[#131b2e] whitespace-nowrap">
                              {rcp.receiptNo}
                            </td>
                            <td className="py-2.5 px-3">
                              {linkedStudent ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenStudentLedger(linkedStudent)
                                  }
                                  className="font-semibold text-[#131b2e] hover:text-[#005c55] hover:underline text-left"
                                >
                                  {rcp.studentName}
                                </button>
                              ) : (
                                <span className="font-semibold text-[#131b2e]">
                                  {rcp.studentName}
                                </span>
                              )}
                              <div className="font-mono text-[11px] text-[#3e4947]">
                                {rcp.rollNo} ·{' '}
                                {getBatchHeadForAY(
                                  headerConfig,
                                  rcp.enrollmentAY
                                ).batchTitle}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#3e4947] whitespace-nowrap">
                              {rcp.allocatedToXI > 0 && rcp.allocatedToXII > 0
                                ? `${headerConfig.year1ShortLabel} + ${headerConfig.year2ShortLabel}`
                                : rcp.allocatedToXI > 0
                                ? headerConfig.year1ShortLabel
                                : headerConfig.year2ShortLabel}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-[#131b2e] whitespace-nowrap">
                              {rcp.paymentMode}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#131b2e]">
                              {formatINR(rcp.amount)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#7d4200]">
                              {fine > 0 ? formatINR(fine) : '₹0'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums text-[#006c49]">
                              {formatINR(rcp.amount + fine)}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
            {cashbookSummary.matchingActiveReceipts.length > 150 && (
              <div className="text-[11px] text-[#3e4947] text-right">
                Showing latest 150 receipts on screen. Use{' '}
                <strong>Export Cashbook (.xlsx)</strong> to download all{' '}
                {cashbookSummary.matchingActiveReceipts.length} receipts.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MULTI-BATCH PENDING RECOVERY TRACKER */}
      {reportTab === 'pending_recovery' && (
        <div className="rounded-2xl bg-white shadow-[0_1px_8px_rgba(19,27,46,0.04)] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[#f2f3ff]">
            <div>
              <h2 className="font-display text-base font-bold text-[#131b2e]">
                Pending Students Recovery List (Session {selectedAY})
              </h2>
              <p className="text-xs text-[#3e4947] mt-0.5">
                Includes active unpaid &amp; partial dues across all batches in{' '}
                {selectedAY}. Recording a payment removes them automatically.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label="Filter pending list by batch"
                value={pendingBatchFilter}
                onChange={(e) => setPendingBatchFilter(e.target.value)}
                className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 font-mono text-xs font-semibold text-[#131b2e] no-print"
              >
                <option value="ALL">
                  All Active Dues ({allPendingRecoveryRows.length})
                </option>
                {allDynamicBatches.map((b) => {
                  const cnt = allPendingRecoveryRows.filter(
                    (r) => r.student.enrollmentAY === b
                  ).length;
                  return (
                    <option key={b} value={b}>
                      {getBatchHeadForAY(headerConfig, b).batchTitle} ({cnt})
                    </option>
                  );
                })}
              </select>
              <div className="font-mono text-xs font-bold text-[#ba1a1a]">
                Due Total: {formatINR(totalPendingDueNow)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#f2f3ff] bg-[#faf8ff] text-[11px] font-semibold text-[#3e4947]">
                  <th className="py-3 px-5">#</th>
                  <th className="py-3 px-3">Student</th>
                  <th className="py-3 px-3">Batch Head</th>
                  <th className="py-3 px-3">
                    {headerConfig.year1ShortLabel} Status
                  </th>
                  <th className="py-3 px-3">
                    {headerConfig.year2ShortLabel} Status
                  </th>
                  <th className="py-3 px-3 text-right">Due Now (₹)</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-5 text-right no-print">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f3ff]">
                {filteredPendingRecoveryRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-10 text-center text-xs text-[#3e4947]"
                    >
                      No pending dues for this filter in Session {selectedAY}.
                    </td>
                  </tr>
                ) : (
                  filteredPendingRecoveryRows.map((row) => (
                    <tr
                      key={row.student.studentId}
                      className="hover:bg-[#faf8ff] transition-colors"
                    >
                      <td className="py-3 px-5 font-mono text-[#3e4947]">
                        {row.srNo}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => onOpenStudentLedger(row.student)}
                          className="font-semibold text-[#131b2e] hover:text-[#005c55] hover:underline text-left"
                        >
                          {row.student.fullName}
                        </button>
                        <div className="font-mono text-[11px] text-[#3e4947]">
                          {row.student.rollNo} ·{' '}
                          {isPlaceholderPhone(row.student.phone) ? (
                            <span className="font-sans text-[#7d4200]">
                              Phone missing
                            </span>
                          ) : (
                            row.student.phone
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[#3e4947]">
                        {getBatchHeadForAY(
                          headerConfig,
                          row.student.enrollmentAY
                        ).batchTitle}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#131b2e]">
                        {row.xiStatus}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#7d4200] font-medium">
                        {row.xiiStatus}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-[#ba1a1a]">
                        {formatINR(row.pendingAmount)}
                      </td>
                      <td className="py-3 px-3 font-medium text-[#7d4200]">
                        {getStatusDisplayLabel(headerConfig, row.category)}
                      </td>
                      <td className="py-3 px-5 text-right no-print whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyReminder(row.student, row.pendingAmount)
                            }
                            className="inline-flex items-center gap-1 rounded-xl bg-[#f2f3ff] px-2.5 py-1.5 text-[11px] font-semibold text-[#131b2e] hover:bg-[#e2e7ff] whitespace-nowrap"
                            title="Copy WhatsApp/SMS fee reminder text"
                          >
                            {copiedStudentId === row.student.studentId ? (
                              <>
                                <Check className="h-3 w-3 text-[#006c49]" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 text-[#005c55]" />
                                Reminder
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenStudentLedger(row.student)}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#005c55] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0f766e] whitespace-nowrap"
                          >
                            <PlusCircle className="h-3 w-3" />
                            Collect
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#eaedff] bg-[#faf8ff] font-mono text-xs font-bold text-[#131b2e] tabular-nums">
                  <td className="py-3.5 px-5">
                    {filteredPendingRecoveryRows.length}
                  </td>
                  <td className="py-3.5 px-3 font-sans" colSpan={4}>
                    Total Pending Students (
                    {pendingBatchFilter === 'ALL'
                      ? 'All Batches'
                      : `Batch ${pendingBatchFilter}`}
                    )
                  </td>
                  <td className="py-3.5 px-3 text-right text-[#ba1a1a]">
                    {formatINR(totalPendingDueNow)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DYNAMIC FORMULA-BASED EXECUTIVE SUMMARY TABLE */}
      {reportTab === 'executive_summary' && (
        <div className="rounded-2xl bg-white shadow-[0_1px_8px_rgba(19,27,46,0.04)] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-[#f2f3ff]">
            <div>
              <h2 className="font-display text-base font-bold text-[#131b2e]">
                Formula-Based Executive Summary (
                {executiveGrandTotals.totalCount} Students · Session{' '}
                {selectedAY})
              </h2>
              <p className="text-xs text-[#3e4947]">
                Dynamic across all admission batches. Click any status row to
                inspect those students.
              </p>
            </div>
            <div className="font-mono text-xs font-bold text-[#006c49]">
              Total Collected: {formatINR(executiveGrandTotals.totalPaidSum)}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#f2f3ff] bg-[#faf8ff] text-[11px] font-semibold text-[#3e4947]">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-3">Status Category</th>
                  {allDynamicBatches.map((b) => (
                    <th
                      key={b}
                      className="py-3 px-3 text-right font-mono whitespace-nowrap"
                    >
                      {getBatchHeadForAY(headerConfig, b).batchTitle}
                    </th>
                  ))}
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="py-3 px-3 text-right">
                    {headerConfig.year1ShortLabel} Paid
                  </th>
                  <th className="py-3 px-3 text-right">
                    {headerConfig.year2ShortLabel} Paid
                  </th>
                  <th className="py-3 px-3 text-right">Total Paid</th>
                  <th className="py-3 px-4">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f3ff]">
                {executiveSummaryRows.map((row) => (
                  <tr
                    key={row.category}
                    onClick={() => {
                      setCategoryFilter(row.category);
                      setReportTab('custom_extractor');
                    }}
                    className="hover:bg-[#faf8ff] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-[#3e4947]">
                      {row.sr}
                    </td>
                    <td className="py-3 px-3 font-semibold text-[#131b2e]">
                      {getStatusDisplayLabel(headerConfig, row.category)}
                    </td>
                    {allDynamicBatches.map((b) => (
                      <td
                        key={b}
                        className="py-3 px-3 text-right font-mono tabular-nums text-[#131b2e]"
                      >
                        {row.countsByBatch[b] || 0}
                      </td>
                    ))}
                    <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-[#005c55]">
                      {row.totalCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-[#131b2e]">
                      {formatINR(row.xiPaidSum)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-[#131b2e]">
                      {formatINR(row.xiiPaidSum)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-[#006c49]">
                      {formatINR(row.totalPaidSum)}
                    </td>
                    <td className="py-3 px-4 text-[#3e4947]">
                      {row.description}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#eaedff] bg-[#faf8ff] font-mono text-xs font-bold text-[#131b2e] tabular-nums">
                  <td className="py-3.5 px-4" />
                  <td className="py-3.5 px-3 font-sans">TOTAL</td>
                  {allDynamicBatches.map((b) => (
                    <td key={b} className="py-3.5 px-3 text-right">
                      {executiveGrandTotals.countsByBatch[b] || 0}
                    </td>
                  ))}
                  <td className="py-3.5 px-3 text-right text-[#005c55]">
                    {executiveGrandTotals.totalCount}
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    {formatINR(executiveGrandTotals.xiPaidSum)}
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    {formatINR(executiveGrandTotals.xiiPaidSum)}
                  </td>
                  <td className="py-3.5 px-3 text-right text-[#006c49]">
                    {formatINR(executiveGrandTotals.totalPaidSum)}
                  </td>
                  <td className="py-3.5 px-4 font-sans text-[#3e4947]">
                    Overall Collection
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CUSTOM FILTER & EXTRACTOR */}
      {reportTab === 'custom_extractor' && (
        <div className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(19,27,46,0.04)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#131b2e]">
              <Filter className="h-4 w-4 text-[#005c55]" />
              <span>Filter Register Data for Review &amp; Export</span>
            </div>

            <div className="text-xs text-[#3e4947] font-mono tabular-nums">
              {summaryMetrics.count} students · XI:{' '}
              <strong className="text-[#131b2e]">
                {formatINR(summaryMetrics.paidXI)}
              </strong>{' '}
              · XII:{' '}
              <strong className="text-[#131b2e]">
                {formatINR(summaryMetrics.paidXII)}
              </strong>{' '}
              · Total:{' '}
              <strong className="text-[#006c49]">
                {formatINR(summaryMetrics.totalPaid)}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 no-print">
            <div>
              <label className="block text-xs font-semibold text-[#3e4947] mb-1">
                Academic Year
              </label>
              <select
                value={reportScopeAY}
                onChange={(e) => setReportScopeAY(e.target.value)}
                className="w-full rounded-xl bg-[#f2f3ff] px-3 py-2 font-mono text-xs font-semibold text-[#131b2e]"
              >
                {availableAYs.map((ay) => (
                  <option key={ay} value={ay}>
                    {ay}
                  </option>
                ))}
                <option value="ALL_BATCHES">All Years</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#3e4947] mb-1">
                Class
              </label>
              <select
                value={classFilter}
                onChange={(e) =>
                  setClassFilter(e.target.value as 'ALL' | ClassLevel)
                }
                className="w-full rounded-xl bg-[#f2f3ff] px-3 py-2 text-xs font-medium text-[#131b2e]"
              >
                <option value="ALL">All Classes (XI &amp; XII)</option>
                <option value="XI">Class XI Only</option>
                <option value="XII">Class XII Only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#3e4947] mb-1">
                Status Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(
                    e.target.value as 'ALL' | RegisterStatusCategory
                  )
                }
                className="w-full rounded-xl bg-[#f2f3ff] px-3 py-2 text-xs font-medium text-[#131b2e]"
              >
                <option value="ALL">All 8 Status Categories</option>
                {REGISTER_STATUS_CATEGORIES.map((c) => (
                  <option key={c.category} value={c.category}>
                    {getStatusDisplayLabel(headerConfig, c.category)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#3e4947] mb-1">
                Search Student
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#3e4947]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Name or EC No..."
                  className="w-full rounded-xl bg-[#f2f3ff] py-2 pl-8 pr-3 text-xs text-[#131b2e]"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#f2f3ff]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#f2f3ff] bg-[#faf8ff] text-[11px] font-semibold text-[#3e4947]">
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Student</th>
                  <th className="py-2.5 px-3">Batch Head</th>
                  <th className="py-2.5 px-3">1st Yr Date</th>
                  <th className="py-2.5 px-3 text-right">
                    {headerConfig.year1ShortLabel}
                  </th>
                  <th className="py-2.5 px-3">2nd Yr Date</th>
                  <th className="py-2.5 px-3 text-right">
                    {headerConfig.year2ShortLabel}
                  </th>
                  <th className="py-2.5 px-3 text-right">Total Paid</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right no-print">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f3ff]">
                {reportRows.map((row, idx) => {
                  const { student } = row;
                  return (
                    <tr
                      key={student.studentId}
                      className="hover:bg-[#faf8ff]"
                    >
                      <td className="py-2.5 px-3 font-mono text-[#3e4947]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => onOpenStudentLedger(student)}
                          className="font-semibold text-[#131b2e] hover:text-[#005c55] hover:underline text-left"
                        >
                          {student.fullName}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#3e4947]">
                        {getBatchHeadForAY(
                          headerConfig,
                          student.enrollmentAY
                        ).batchTitle}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#3e4947]">
                        {student.xiPaymentDate || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-[#131b2e]">
                        {formatINR(student.paidClassXI)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#3e4947]">
                        {student.xiiPaymentDate || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-[#131b2e]">
                        {formatINR(student.paidClassXII)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-[#006c49]">
                        {formatINR(student.totalPaid)}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[#131b2e]">
                        {getStatusDisplayLabel(
                          headerConfig,
                          row.registerCategory
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right no-print">
                        <button
                          type="button"
                          onClick={() => onOpenStudentLedger(student)}
                          className="inline-flex items-center gap-1 rounded-xl bg-[#005c55] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#0f766e] whitespace-nowrap"
                        >
                          <PlusCircle className="h-3 w-3" />
                          Collect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {reportRows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-[#eaedff] bg-[#faf8ff] font-mono text-xs font-bold text-[#131b2e] tabular-nums">
                    <td className="py-3 px-3 font-sans" colSpan={4}>
                      TOTAL ({summaryMetrics.count} Students)
                    </td>
                    <td className="py-3 px-3 text-right">
                      {formatINR(summaryMetrics.paidXI)}
                    </td>
                    <td className="py-3 px-3" />
                    <td className="py-3 px-3 text-right">
                      {formatINR(summaryMetrics.paidXII)}
                    </td>
                    <td className="py-3 px-3 text-right text-[#006c49]">
                      {formatINR(summaryMetrics.totalPaid)}
                    </td>
                    <td
                      colSpan={2}
                      className="py-3 px-3 text-right text-[#ba1a1a]"
                    >
                      Pending: {formatINR(summaryMetrics.totalPending)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
