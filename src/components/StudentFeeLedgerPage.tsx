import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Printer,
  RotateCcw,
  Scissors,
  X,
} from 'lucide-react';
import {
  AllocationTarget,
  FeeStructureSettings,
  HeaderConfig,
  PaymentMode,
  PaymentRecord,
  StudentRecord,
} from '../types';
import {
  calculatePaymentAllocation,
  computeDynamicRegisterCategory,
  computeNetYearFees,
  formatINR,
  formatToRegisterDate,
  getBatchHeadForAY,
  getClassHeadDisplayName,
  getStatusDisplayLabel,
  getYear2AdvancePaymentInfo,
  isActivePayment,
  isClassXIIDueInAY,
  isPlaceholderPhone,
  isReversedPayment,
} from '../utils/ledgerLogic';

interface StudentFeeLedgerPageProps {
  student: StudentRecord;
  selectedAY: string;
  availableAYs: string[];
  headerConfig: HeaderConfig;
  payments: PaymentRecord[];
  feeSettings: FeeStructureSettings;
  defaultReceiptNo: string;
  onBackToCollection: () => void;
  onEditStudent: (student: StudentRecord) => void;
  onRecordPayment: (payload: {
    student: StudentRecord;
    amount: number;
    fineAmount: number;
    targetClass: AllocationTarget;
    allocatedToXI: number;
    allocatedToXII: number;
    newPaidClassXI: number;
    newPaidClassXII: number;
    newTotalPaid: number;
    newXiDate: string;
    newXiiDate: string;
    newRemark: string;
    paymentDate: string;
    paymentMode: PaymentMode;
    referenceNo: string;
    receiptNo: string;
    installmentLabel: string;
    notes: string;
    recordedInAY: string;
  }) => Promise<void>;
  onReversePayment: (
    payment: PaymentRecord,
    student: StudentRecord,
    reason: string
  ) => Promise<void>;
}

export const StudentFeeLedgerPage: React.FC<StudentFeeLedgerPageProps> = ({
  student,
  selectedAY,
  availableAYs: _availableAYs,
  headerConfig,
  payments,
  feeSettings,
  defaultReceiptNo,
  onBackToCollection,
  onEditStudent,
  onRecordPayment,
  onReversePayment,
}) => {
  void _availableAYs;
  const [selectedTerms, setSelectedTerms] = useState<{
    xi: boolean;
    xii: boolean;
  }>({
    xi: false,
    xii: false,
  });

  // Inline Fee Collection Panel State
  const [collectBoxOpen, setCollectBoxOpen] = useState<boolean>(false);
  const [collectTarget, setCollectTarget] = useState<AllocationTarget>('XI');
  const [collectAmount, setCollectAmount] = useState<string>('10000');
  const [collectDate, setCollectDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [collectMode, setCollectMode] = useState<PaymentMode>('UPI');
  const [collectModeLabel, setCollectModeLabel] = useState<string>('UPI');
  const [collectReceiptNo, setCollectReceiptNo] =
    useState<string>(defaultReceiptNo);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Printable Two-Copy Receipt Modal State
  const [printingReceipt, setPrintingReceipt] = useState<PaymentRecord | null>(
    null
  );

  // Confirmed Receipt Reversal Modal State
  const [reversingReceipt, setReversingReceipt] =
    useState<PaymentRecord | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [reversingBusy, setReversingBusy] = useState<boolean>(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPrintingReceipt(null);
        setReversingReceipt(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Ensure body class is cleaned up if component unmounts during print
  useEffect(() => {
    return () => {
      document.body.classList.remove('printing-receipt');
    };
  }, []);

  const { netClassXIFee, netClassXIIFee, totalIntegratedFee } = useMemo(
    () =>
      computeNetYearFees(
        student.classXIFee,
        student.classXIIFee,
        student.scholarshipDiscount
      ),
    [student.classXIFee, student.classXIIFee, student.scholarshipDiscount]
  );

  const pendingXI = Math.max(0, netClassXIFee - student.paidClassXI);
  const pendingXII = Math.max(0, netClassXIIFee - student.paidClassXII);
  const totalRem = Math.max(0, totalIntegratedFee - student.totalPaid);
  const xiiDueNow = isClassXIIDueInAY(student, selectedAY);

  const studentAllPayments = useMemo(
    () => payments.filter((p) => p.studentId === student.studentId),
    [payments, student.studentId]
  );

  const studentActivePayments = useMemo(
    () => studentAllPayments.filter(isActivePayment),
    [studentAllPayments]
  );

  const studentReversedReceipts = useMemo(
    () => studentAllPayments.filter(isReversedPayment),
    [studentAllPayments]
  );

  // Dynamic Full Paid vs Lesser Paid threshold respecting student's custom net fee
  const isFullTermReceipt = (p: PaymentRecord): boolean => {
    if (p.targetClass === 'XI') {
      const target = netClassXIFee > 0 ? netClassXIFee : 10000;
      return p.amount >= target;
    }
    if (p.targetClass === 'XII') {
      const target = netClassXIIFee > 0 ? netClassXIIFee : 10000;
      return p.amount >= target;
    }
    const minTerm = Math.min(
      netClassXIFee > 0 ? netClassXIFee : totalIntegratedFee,
      netClassXIIFee > 0 ? netClassXIIFee : totalIntegratedFee
    );
    return p.amount >= (minTerm > 0 ? minTerm : 10000);
  };

  const fullPaidReceipts = useMemo(
    () => studentActivePayments.filter(isFullTermReceipt),
    [studentActivePayments, netClassXIFee, netClassXIIFee, totalIntegratedFee]
  );

  const lesserPaidReceipts = useMemo(
    () =>
      studentActivePayments.filter(
        (p) => p.amount > 0 && !isFullTermReceipt(p)
      ),
    [studentActivePayments, netClassXIFee, netClassXIIFee, totalIntegratedFee]
  );

  const batchHead = useMemo(
    () => getBatchHeadForAY(headerConfig, student.enrollmentAY),
    [headerConfig, student.enrollmentAY]
  );

  const year2AdvanceInfo = useMemo(
    () => getYear2AdvancePaymentInfo(student, studentAllPayments),
    [student, studentAllPayments]
  );

  const currentClassDisplay = useMemo(() => {
    if (student.admissionClass === 'XII') {
      return `${batchHead.classXIIHeadName} (Direct)`;
    }
    if (selectedAY === student.enrollmentAY) {
      return batchHead.classXIHeadName;
    }
    if (selectedAY === student.progressionAY) {
      return batchHead.classXIIHeadName;
    }
    return `${batchHead.classXIHeadName} → ${batchHead.classXIIHeadName}`;
  }, [student.admissionClass, student.enrollmentAY, student.progressionAY, selectedAY, batchHead]);

  const currentStatusCategory = useMemo(
    () => computeDynamicRegisterCategory(student, selectedAY),
    [student, selectedAY]
  );

  const currentStatusDisplay = useMemo(
    () => getStatusDisplayLabel(headerConfig, currentStatusCategory),
    [headerConfig, currentStatusCategory]
  );

  const syncFormForSelection = (next: { xi: boolean; xii: boolean }) => {
    setSelectedTerms(next);

    if (next.xi && next.xii) {
      const combinedDue = pendingXI + pendingXII;
      setCollectTarget('INTEGRATED');
      setCollectAmount(String(combinedDue > 0 ? combinedDue : totalIntegratedFee));
      setCollectReceiptNo(defaultReceiptNo);
      setCollectBoxOpen(true);
    } else if (next.xi) {
      setCollectTarget('XI');
      setCollectAmount(String(pendingXI > 0 ? pendingXI : netClassXIFee || 10000));
      setCollectReceiptNo(defaultReceiptNo);
      setCollectBoxOpen(true);
    } else if (next.xii) {
      setCollectTarget('XII');
      setCollectAmount(
        String(pendingXII > 0 ? pendingXII : netClassXIIFee || 10000)
      );
      setCollectReceiptNo(defaultReceiptNo);
      setCollectBoxOpen(true);
    } else {
      setCollectBoxOpen(false);
    }
  };

  const handleTermToggle = (term: 'xi' | 'xii') => {
    if (term === 'xi' && pendingXI <= 0) return;
    if (term === 'xii' && pendingXII <= 0) return;
    const next = { ...selectedTerms, [term]: !selectedTerms[term] };
    syncFormForSelection(next);
  };

  const handleCloseCollectForm = () => {
    setCollectBoxOpen(false);
    setSelectedTerms({ xi: false, xii: false });
  };

  const selectedDueAmount = useMemo(() => {
    if (selectedTerms.xi && selectedTerms.xii) return pendingXI + pendingXII;
    if (selectedTerms.xi) return pendingXI;
    if (selectedTerms.xii) return pendingXII;
    return totalRem;
  }, [selectedTerms, pendingXI, pendingXII, totalRem]);

  const numericCollectAmount = Math.max(
    0,
    Math.round(Number(collectAmount) || 0)
  );
  const remainingAfterThisPayment = Math.max(
    0,
    selectedDueAmount - numericCollectAmount
  );
  const isPartPayment =
    numericCollectAmount > 0 && numericCollectAmount < selectedDueAmount;
  const inlineOverpayment =
    numericCollectAmount > totalRem ? numericCollectAmount - totalRem : 0;

  const handleConfirmCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numericCollectAmount <= 0) return;

    setSubmitting(true);
    try {
      const allocation = calculatePaymentAllocation(
        student,
        numericCollectAmount,
        collectTarget
      );
      const formattedDate = formatToRegisterDate(collectDate);

      const newXiDate =
        allocation.allocatedToXI > 0 ? formattedDate : student.xiPaymentDate;
      const newXiiDate =
        allocation.allocatedToXII > 0 ? formattedDate : student.xiiPaymentDate;

      const updatedTemp: StudentRecord = {
        ...student,
        paidClassXI: allocation.newPaidClassXI,
        paidClassXII: allocation.newPaidClassXII,
        totalPaid: allocation.newTotalPaid,
        xiPaymentDate: newXiDate,
        xiiPaymentDate: newXiiDate,
      };
      const newRemark = computeDynamicRegisterCategory(updatedTemp, selectedAY);

      const headerLabel =
        collectTarget === 'XI'
          ? headerConfig.year1HeadName
          : collectTarget === 'XII'
          ? headerConfig.year2HeadName
          : headerConfig.combinedHeadName;

      await onRecordPayment({
        student,
        amount: numericCollectAmount,
        fineAmount: 0,
        targetClass: collectTarget,
        allocatedToXI: allocation.allocatedToXI,
        allocatedToXII: allocation.allocatedToXII,
        newPaidClassXI: allocation.newPaidClassXI,
        newPaidClassXII: allocation.newPaidClassXII,
        newTotalPaid: allocation.newTotalPaid,
        newXiDate,
        newXiiDate,
        newRemark,
        paymentDate: formattedDate,
        paymentMode: collectMode,
        referenceNo: collectModeLabel || collectMode,
        receiptNo: collectReceiptNo.trim() || defaultReceiptNo,
        installmentLabel: headerLabel,
        notes: `${headerLabel} (${collectModeLabel})`,
        recordedInAY: selectedAY,
      });

      setCollectBoxOpen(false);
      setSelectedTerms({ xi: false, xii: false });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingReceipt || !reversalReason.trim()) return;
    setReversingBusy(true);
    try {
      await onReversePayment(reversingReceipt, student, reversalReason.trim());
      setReversingReceipt(null);
      setReversalReason('');
    } finally {
      setReversingBusy(false);
    }
  };

  const handlePrintOfficialReceipt = () => {
    document.body.classList.add('printing-receipt');
    const cleanup = () => {
      document.body.classList.remove('printing-receipt');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    window.setTimeout(cleanup, 1200);
  };

  const renderReceiptCopyCard = (
    copyLabel: string,
    rcp: PaymentRecord
  ) => {
    const fineAmt = Math.max(0, Number(rcp.fineAmount) || 0);
    const grandAmt = rcp.amount + fineAmt;
    const isRev = isReversedPayment(rcp);

    return (
      <div className="rounded-xl border border-[#131b2e]/30 bg-white p-4 space-y-3 text-xs text-[#131b2e]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#eaedff] pb-2.5">
          <div>
            <div className="font-display text-sm font-bold text-[#005c55]">
              {feeSettings.schoolDisplayName}
            </div>
            <div className="text-[11px] text-[#3e4947]">
              {headerConfig.receiptSubtitle} · {batchHead.batchTitle} (
              {student.enrollmentAY} → {student.progressionAY})
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#131b2e] border border-[#131b2e]/30 rounded px-2 py-0.5 inline-block">
              {copyLabel}
            </div>
            {isRev && (
              <div className="mt-1 font-mono text-[10px] font-bold text-[#ba1a1a]">
                CANCELLED / REVERSED
              </div>
            )}
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <div>
            <span className="text-[#3e4947]">Receipt No.: </span>
            <strong className="font-mono">{rcp.receiptNo}</strong>
          </div>
          <div className="text-right">
            <span className="text-[#3e4947]">Date: </span>
            <strong className="font-mono">
              {rcp.paymentDate.replace(/\//g, '-')}
            </strong>
          </div>
          <div>
            <span className="text-[#3e4947]">Student Name: </span>
            <strong>{student.fullName}</strong>
          </div>
          <div className="text-right">
            <span className="text-[#3e4947]">EC No.: </span>
            <strong className="font-mono">{student.rollNo}</strong>
          </div>
          <div>
            <span className="text-[#3e4947]">Father Name: </span>
            <strong>{student.fatherName || '—'}</strong>
          </div>
          <div className="text-right">
            <span className="text-[#3e4947]">Mode / Ref: </span>
            <strong className="font-mono">
              {rcp.paymentMode}
              {rcp.referenceNo && rcp.referenceNo !== rcp.paymentMode
                ? ` (${rcp.referenceNo})`
                : ''}
            </strong>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="w-full border-collapse border border-[#bdc9c6] text-[11px]">
          <thead>
            <tr className="bg-[#faf8ff] border-b border-[#bdc9c6] text-[#3e4947]">
              <th className="py-1.5 px-2.5 text-left">Fee Particular</th>
              <th className="py-1.5 px-2.5 text-left">Allocation</th>
              <th className="py-1.5 px-2.5 text-right font-mono">
                Amount (₹)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eaedff]">
            <tr>
              <td className="py-1.5 px-2.5 font-medium">
                {rcp.installmentLabel}
              </td>
              <td className="py-1.5 px-2.5 font-mono text-[#3e4947]">
                {rcp.allocatedToXI > 0 && rcp.allocatedToXII > 0
                  ? `XI: ${formatINR(rcp.allocatedToXI)} · XII: ${formatINR(rcp.allocatedToXII)}`
                  : rcp.allocatedToXI > 0
                  ? `Class XI (${student.enrollmentAY})`
                  : `Class XII (${student.progressionAY})`}
              </td>
              <td
                className={`py-1.5 px-2.5 text-right font-mono font-semibold tabular-nums ${
                  isRev ? 'line-through text-[#ba1a1a]' : ''
                }`}
              >
                {formatINR(rcp.amount)}
              </td>
            </tr>
            {fineAmt > 0 && (
              <tr>
                <td className="py-1.5 px-2.5 text-[#3e4947]">
                  Late Fee / Fine
                </td>
                <td className="py-1.5 px-2.5 text-[#3e4947]">Additional</td>
                <td
                  className={`py-1.5 px-2.5 text-right font-mono font-semibold tabular-nums ${
                    isRev ? 'line-through text-[#ba1a1a]' : ''
                  }`}
                >
                  {formatINR(fineAmt)}
                </td>
              </tr>
            )}
            <tr className="bg-[#faf8ff] font-bold">
              <td className="py-1.5 px-2.5" colSpan={2}>
                Total Received
              </td>
              <td
                className={`py-1.5 px-2.5 text-right font-mono tabular-nums ${
                  isRev ? 'line-through text-[#ba1a1a]' : 'text-[#006c49]'
                }`}
              >
                {formatINR(grandAmt)}
              </td>
            </tr>
          </tbody>
        </table>

        {isRev && rcp.reversalReason && (
          <div className="rounded bg-[#ffdad6]/50 px-2.5 py-1 text-[10px] text-[#ba1a1a]">
            <strong>Reversal Reason:</strong> {rcp.reversalReason}
          </div>
        )}

        {/* Footer Signature Row */}
        <div className="flex items-end justify-between pt-2 text-[10px] text-[#3e4947]">
          <div>
            <div>
              Status:{' '}
              <strong className="text-[#131b2e]">{currentStatusDisplay}</strong>
              {' · '}Balance Due:{' '}
              <strong className="font-mono text-[#131b2e]">
                {formatINR(totalRem)}
              </strong>
            </div>
            <div className="text-[9px] text-[#3e4947]/80 mt-0.5">
              Computer-generated receipt · Fees once paid are subject to school
              rules.
            </div>
          </div>
          <div className="text-right">
            <div className="border-t border-[#131b2e]/40 pt-1 px-4 font-semibold text-[#131b2e]">
              Cashier / Authorized Signatory
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Subtle Clean Back Link */}
      <div className="no-print">
        <button
          type="button"
          onClick={onBackToCollection}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3e4947] hover:text-[#005c55] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Fee Collection
        </button>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(19,27,46,0.04)] space-y-6">
        {/* STUDENT PROFILE HEADER BLOCK */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-[#f2f3ff] pb-6">
          <div className="space-y-1.5 text-[13px] text-[#3e4947]">
            <div className="text-xs font-semibold text-[#005c55]">
              Student Integrated Fee Ledger
            </div>
            <h1 className="font-display text-xl font-bold text-[#131b2e]">
              {student.fullName}
            </h1>
            <div className="pt-1 space-y-1 text-xs">
              <div>
                <span className="font-semibold text-[#131b2e]">EC No. : </span>
                <span className="font-mono font-semibold text-[#131b2e]">
                  {student.rollNo}
                </span>
                <span className="mx-2 text-[#bdc9c6]" aria-hidden="true">
                  ·
                </span>
                <span className="font-semibold text-[#131b2e]">Class : </span>
                <span>{currentClassDisplay}</span>
              </div>
              <div className="flex flex-wrap items-center gap-y-1">
                <span>
                  <span className="font-semibold text-[#131b2e]">
                    Father Name :{' '}
                  </span>
                  <span>{student.fatherName || '—'}</span>
                </span>
                <span className="mx-2 text-[#bdc9c6]" aria-hidden="true">
                  ·
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-semibold text-[#131b2e]">Mobile : </span>
                  {isPlaceholderPhone(student.phone) ? (
                    <button
                      type="button"
                      onClick={() => onEditStudent(student)}
                      className="text-[#7d4200] font-semibold hover:underline"
                    >
                      Phone missing · Update Phone
                    </button>
                  ) : (
                    <span className="font-mono">{student.phone}</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Right Batch & 1st Year / 2nd Year Integrated Header Cards */}
          <div className="rounded-2xl bg-[#faf8ff] p-4 min-w-[300px] sm:min-w-[440px] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#131b2e]">
                {batchHead.batchTitle} · {student.enrollmentAY} →{' '}
                {student.progressionAY}
              </span>
              <button
                type="button"
                onClick={() => onEditStudent(student)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#005c55] hover:underline no-print"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit Student
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* 1ST YEAR HEADER CARD */}
              <div className="rounded-xl bg-white p-3.5 shadow-[0_1px_4px_rgba(19,27,46,0.04)] space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-display text-xs font-bold text-[#005c55]">
                    1st Year · {student.enrollmentAY}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      student.paidClassXI >= netClassXIFee && netClassXIFee > 0
                        ? 'text-[#006c49]'
                        : student.paidClassXI > 0
                        ? 'text-[#7d4200]'
                        : 'text-[#ba1a1a]'
                    }`}
                  >
                    {netClassXIFee === 0
                      ? 'N/A'
                      : student.paidClassXI >= netClassXIFee
                      ? 'PAID'
                      : student.paidClassXI > 0
                      ? 'PARTIAL-PAID'
                      : 'PENDING'}
                  </span>
                </div>
                <div className="text-[11px] text-[#3e4947] truncate">
                  {headerConfig.year1ShortLabel}
                </div>
                <div className="flex items-baseline justify-between font-mono font-bold">
                  <span className="text-sm text-[#131b2e] tabular-nums">
                    {formatINR(student.paidClassXI)}
                  </span>
                  <span className="text-[11px] text-[#3e4947] tabular-nums">
                    / {formatINR(netClassXIFee)}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#3e4947]">
                  {student.xiPaymentDate && student.xiPaymentDate !== '-'
                    ? `Paid on ${student.xiPaymentDate}`
                    : 'Not paid yet'}
                </div>
              </div>

              {/* 2ND YEAR HEADER CARD */}
              <div className="rounded-xl bg-white p-3.5 shadow-[0_1px_4px_rgba(19,27,46,0.04)] space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-display text-xs font-bold text-[#005c55]">
                    2nd Year · {student.progressionAY}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      student.paidClassXII >= netClassXIIFee &&
                      netClassXIIFee > 0
                        ? 'text-[#006c49]'
                        : student.paidClassXII > 0
                        ? 'text-[#7d4200]'
                        : xiiDueNow
                        ? 'text-[#7d4200]'
                        : 'text-[#005c55]'
                    }`}
                  >
                    {netClassXIIFee === 0
                      ? 'N/A'
                      : student.paidClassXII >= netClassXIIFee
                      ? 'PAID'
                      : student.paidClassXII > 0
                      ? 'PARTIAL-PAID'
                      : xiiDueNow
                      ? 'PENDING'
                      : 'UPCOMING'}
                  </span>
                </div>
                <div className="text-[11px] text-[#3e4947] truncate">
                  {headerConfig.year2ShortLabel}
                </div>
                <div className="flex items-baseline justify-between font-mono font-bold">
                  <span className="text-sm text-[#131b2e] tabular-nums">
                    {formatINR(student.paidClassXII)}
                  </span>
                  <span className="text-[11px] text-[#3e4947] tabular-nums">
                    / {formatINR(netClassXIIFee)}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#3e4947]">
                  {year2AdvanceInfo.isPaid && year2AdvanceInfo.paidInAdvance ? (
                    <span className="text-[#006c49] font-sans font-semibold">
                      Paid in Advance ({year2AdvanceInfo.paidInAY})
                    </span>
                  ) : student.xiiPaymentDate && student.xiiPaymentDate !== '-' ? (
                    `Paid on ${student.xiiPaymentDate}`
                  ) : (
                    `Due in ${student.progressionAY}`
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs text-[#3e4947]">
              <span>
                Status:{' '}
                <strong className="text-[#131b2e]">
                  {currentStatusDisplay}
                </strong>
              </span>
              <span className="font-mono font-bold text-[#131b2e] tabular-nums">
                {formatINR(student.totalPaid)} / {formatINR(totalIntegratedFee)}
              </span>
            </div>
          </div>
        </div>

        {/* CROSS-YEAR ADVANCE-PAID CONFIRMATION (When viewing in 2nd Year e.g. 2026-27 after paying XI + XII in 2025-26) */}
        {year2AdvanceInfo.isPaid && year2AdvanceInfo.paidInAdvance && (
          <div className="rounded-xl bg-[#e6f7ef] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#006c49]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                <strong>
                  2nd Year ({student.progressionAY}) Already Paid in Advance:
                </strong>{' '}
                Both 1st Year &amp; 2nd Year integrated fees were paid together
                in <strong className="font-mono">{year2AdvanceInfo.paidInAY}</strong>
                {year2AdvanceInfo.paymentDate &&
                year2AdvanceInfo.paymentDate !== '-'
                  ? ` on ${year2AdvanceInfo.paymentDate}`
                  : ''}
                {year2AdvanceInfo.receiptNo
                  ? ` (Receipt ${year2AdvanceInfo.receiptNo})`
                  : ''}
                .
              </span>
            </div>
            <span className="font-mono font-bold whitespace-nowrap">
              {student.progressionAY} Balance Due: ₹0 · PAID
            </span>
          </div>
        )}

        {/* FEE HEADS SELECTION TABLE (Click 1st Year, 2nd Year, or Both to auto-fill payment amount) */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-bold text-[#0f172a]">
                Integrated Fee Heads
              </h2>
              <p className="text-xs text-[#475569]">
                Select 1st Year, 2nd Year, or both heads below to record a full
                or partial payment.
              </p>
            </div>
            {(selectedTerms.xi || selectedTerms.xii) && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#e6f7ef] border border-[#b7e4cf] px-2.5 py-1 text-xs font-semibold text-[#005c55] tabular-nums">
                Selected Due: {formatINR(selectedDueAmount)}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#dce4ee]">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#dce4ee] bg-[#f1f5f9] text-[11px] font-semibold text-[#334155]">
                  <th className="py-3 pl-3.5 pr-1.5 w-9"></th>
                  <th className="py-3 px-2.5 whitespace-nowrap">
                    Due / Paid Date
                  </th>
                  <th className="py-3 px-2.5 whitespace-nowrap">Fee Head</th>
                  <th className="py-3 px-2.5 whitespace-nowrap">
                    Year &amp; Class
                  </th>
                  <th className="py-3 px-2.5 whitespace-nowrap text-right">
                    Fee (₹)
                  </th>
                  <th className="py-3 px-2.5 whitespace-nowrap text-right">
                    Collected (₹)
                  </th>
                  <th className="py-3 px-2.5 whitespace-nowrap text-right">
                    Pending (₹)
                  </th>
                  <th className="py-3 px-2.5 whitespace-nowrap">Status</th>
                  <th className="py-3 pl-2.5 pr-4 whitespace-nowrap text-right no-print">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0] text-[#334155]">
                {netClassXIFee > 0 && (
                  <tr
                    onClick={() => handleTermToggle('xi')}
                    className={`transition-colors ${
                      pendingXI > 0 ? 'cursor-pointer' : ''
                    } ${
                      selectedTerms.xi
                        ? 'bg-[#e6f7ef]/60'
                        : 'hover:bg-[#f8fafc]'
                    }`}
                  >
                    <td
                      className="py-3.5 pl-3.5 pr-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${headerConfig.year1HeadName}`}
                        checked={selectedTerms.xi}
                        disabled={pendingXI <= 0}
                        onChange={() => handleTermToggle('xi')}
                        className="h-4 w-4 rounded border-[#94a3b8] accent-[#005c55] cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="py-3.5 px-2.5 tabular-nums whitespace-nowrap">
                      {student.xiPaymentDate !== '-'
                        ? student.xiPaymentDate.replace(/\//g, '-')
                        : `30-04-${student.enrollmentAY.slice(0, 4)}`}
                    </td>
                    <td className="py-3.5 px-2.5 font-semibold text-[#0f172a] whitespace-nowrap">
                      {headerConfig.year1HeadName}
                    </td>
                    <td className="py-3.5 px-2.5 whitespace-nowrap">
                      <span className="font-medium text-[#0f172a]">
                        {getClassHeadDisplayName(
                          headerConfig,
                          student.enrollmentAY,
                          'XI'
                        )}
                      </span>
                    </td>
                    <td className="py-3.5 px-2.5 text-right tabular-nums">
                      {formatINR(netClassXIFee)}
                    </td>
                    <td className="py-3.5 px-2.5 text-right font-semibold text-[#0f172a] tabular-nums">
                      {formatINR(student.paidClassXI)}
                    </td>
                    <td className="py-3.5 px-2.5 text-right font-semibold tabular-nums">
                      <span
                        className={
                          pendingXI > 0 ? 'text-[#9a4a00]' : 'text-[#006c49]'
                        }
                      >
                        {formatINR(pendingXI)}
                      </span>
                    </td>
                    <td className="py-3.5 px-2.5 whitespace-nowrap font-semibold">
                      {student.paidClassXI >= netClassXIFee ? (
                        <span className="text-[#006c49]">Paid</span>
                      ) : student.paidClassXI > 0 ? (
                        <span className="text-[#9a4a00]">Partial-Paid</span>
                      ) : (
                        <span className="text-[#b91c1c]">Pending</span>
                      )}
                    </td>
                    <td
                      className="py-3.5 pl-2.5 pr-4 text-right whitespace-nowrap no-print"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {pendingXI > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleTermToggle('xi')}
                          className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                            selectedTerms.xi
                              ? 'bg-[#0f172a] text-white'
                              : 'bg-[#005c55] text-white hover:bg-[#0f766e]'
                          }`}
                        >
                          {selectedTerms.xi ? 'Selected' : 'Select 1st Year'}
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#006c49] font-semibold">
                          Cleared
                        </span>
                      )}
                    </td>
                  </tr>
                )}

                {netClassXIIFee > 0 && (
                  <tr
                    onClick={() => handleTermToggle('xii')}
                    className={`transition-colors ${
                      pendingXII > 0 ? 'cursor-pointer' : ''
                    } ${
                      selectedTerms.xii
                        ? 'bg-[#e6f7ef]/60'
                        : 'hover:bg-[#f8fafc]'
                    }`}
                  >
                    <td
                      className="py-3.5 pl-3.5 pr-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${headerConfig.year2HeadName}`}
                        checked={selectedTerms.xii}
                        disabled={pendingXII <= 0}
                        onChange={() => handleTermToggle('xii')}
                        className="h-4 w-4 rounded border-[#94a3b8] accent-[#005c55] cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="py-3.5 px-2.5 tabular-nums whitespace-nowrap">
                      {student.xiiPaymentDate !== '-'
                        ? student.xiiPaymentDate.replace(/\//g, '-')
                        : `30-04-${student.progressionAY.slice(0, 4)}`}
                    </td>
                    <td className="py-3.5 px-2.5 font-semibold text-[#0f172a] whitespace-nowrap">
                      {headerConfig.year2HeadName}
                    </td>
                    <td className="py-3.5 px-2.5 whitespace-nowrap">
                      <span className="font-medium text-[#0f172a]">
                        {getClassHeadDisplayName(
                          headerConfig,
                          student.enrollmentAY,
                          'XII'
                        )}
                      </span>
                    </td>
                    <td className="py-3.5 px-2.5 text-right tabular-nums">
                      {formatINR(netClassXIIFee)}
                    </td>
                    <td className="py-3.5 px-2.5 text-right font-semibold text-[#0f172a] tabular-nums">
                      {formatINR(student.paidClassXII)}
                    </td>
                    <td className="py-3.5 px-2.5 text-right font-semibold tabular-nums">
                      <span
                        className={
                          pendingXII > 0 ? 'text-[#9a4a00]' : 'text-[#006c49]'
                        }
                      >
                        {formatINR(pendingXII)}
                      </span>
                    </td>
                    <td className="py-3.5 px-2.5 whitespace-nowrap font-semibold">
                      {student.paidClassXII >= netClassXIIFee ? (
                        <span className="text-[#006c49]">
                          {year2AdvanceInfo.paidInAdvance &&
                          year2AdvanceInfo.paidInAY
                            ? `Paid (Adv. ${year2AdvanceInfo.paidInAY})`
                            : 'Paid'}
                        </span>
                      ) : student.paidClassXII > 0 ? (
                        <span className="text-[#9a4a00]">Partial-Paid</span>
                      ) : xiiDueNow ? (
                        <span className="text-[#9a4a00]">XII Pending</span>
                      ) : (
                        <span className="text-[#005c55]">Upcoming</span>
                      )}
                    </td>
                    <td
                      className="py-3.5 pl-2.5 pr-4 text-right whitespace-nowrap no-print"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {pendingXII > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleTermToggle('xii')}
                          className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                            selectedTerms.xii
                              ? 'bg-[#0f172a] text-white'
                              : 'bg-[#005c55] text-white hover:bg-[#0f766e]'
                          }`}
                        >
                          {selectedTerms.xii ? 'Selected' : 'Select 2nd Year'}
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#006c49] font-semibold">
                          Cleared
                        </span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PROFESSIONAL RECORD PAYMENT & GENERATE RECEIPT PANEL */}
        {collectBoxOpen && (
          <form
            onSubmit={handleConfirmCollect}
            className="rounded-2xl border border-[#005c55]/35 bg-white shadow-md overflow-hidden no-print"
          >
            {/* Card Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f8fafc] border-b border-[#e2e8f0] px-6 py-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-[15px] font-bold text-[#0f172a]">
                    Record Payment &amp; Generate Receipt
                  </h3>
                  <span className="text-xs font-medium text-[#475569]">
                    · {student.fullName}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[#475569]">Selected Head:</span>
                  {selectedTerms.xi && (
                    <span className="inline-flex items-center rounded-md bg-[#e6f7ef] border border-[#b7e4cf] px-2 py-0.5 text-[11px] font-semibold text-[#005c55] tabular-nums">
                      {headerConfig.year1HeadName} ({formatINR(pendingXI)} due)
                    </span>
                  )}
                  {selectedTerms.xii && (
                    <span className="inline-flex items-center rounded-md bg-[#e6f7ef] border border-[#b7e4cf] px-2 py-0.5 text-[11px] font-semibold text-[#005c55] tabular-nums">
                      {headerConfig.year2HeadName} ({formatINR(pendingXII)} due)
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                aria-label="Close fee entry form"
                onClick={handleCloseCollectForm}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[#475569] hover:bg-[#e2e8f0] hover:text-[#0f172a] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Card Body: Crisp 4-Field Grid (Amount, Payment Date, Mode, Receipt No.) */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {/* 1. Amount (Auto-filled from selected heads, editable for part payment) */}
                <div>
                  <label
                    htmlFor="collect-amount-input"
                    className="block text-xs font-semibold text-[#0f172a] mb-1.5"
                  >
                    Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#475569]">
                      ₹
                    </span>
                    <input
                      id="collect-amount-input"
                      type="number"
                      aria-label="Amount"
                      required
                      min={1}
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      className="w-full h-10 rounded-xl border border-[#cbd5e1] bg-[#f8fafc] pl-8 pr-3 text-sm font-bold text-[#0f172a] tabular-nums focus:bg-white focus:border-[#005c55] focus:outline-none transition-colors"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] tabular-nums">
                    {isPartPayment ? (
                      <span className="font-semibold text-[#9a4a00]">
                        Part Payment · {formatINR(remainingAfterThisPayment)}{' '}
                        pending (Status: Partial-Paid)
                      </span>
                    ) : numericCollectAmount > 0 && inlineOverpayment === 0 ? (
                      <span className="font-medium text-[#006c49]">
                        Full balance for selected head
                        {selectedTerms.xi && selectedTerms.xii ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-[#475569]">
                        Edit amount for partial fee payment
                      </span>
                    )}
                  </p>
                </div>

                {/* 2. Payment Date */}
                <div>
                  <label
                    htmlFor="collect-date-input"
                    className="block text-xs font-semibold text-[#0f172a] mb-1.5"
                  >
                    Payment Date
                  </label>
                  <input
                    id="collect-date-input"
                    type="date"
                    aria-label="Payment Date"
                    required
                    value={collectDate}
                    onChange={(e) => setCollectDate(e.target.value)}
                    className="w-full h-10 rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-3 text-xs font-semibold text-[#0f172a] tabular-nums focus:bg-white focus:border-[#005c55] focus:outline-none transition-colors"
                  />
                </div>

                {/* 3. Payment Mode */}
                <div>
                  <label
                    htmlFor="collect-mode-select"
                    className="block text-xs font-semibold text-[#0f172a] mb-1.5"
                  >
                    Mode
                  </label>
                  <select
                    id="collect-mode-select"
                    aria-label="Payment Mode"
                    value={collectModeLabel}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCollectModeLabel(val);
                      if (val === 'IMPS' || val === 'UPI') {
                        setCollectMode('UPI');
                      } else if (val === 'NEFT/RTGS') {
                        setCollectMode('NEFT/RTGS');
                      } else if (val === 'Cheque') {
                        setCollectMode('Cheque');
                      } else if (val === 'Card') {
                        setCollectMode('Card');
                      } else if (val === 'DD') {
                        setCollectMode('DD');
                      } else {
                        setCollectMode('Cash');
                      }
                    }}
                    className="w-full h-10 rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-3 text-xs font-semibold text-[#0f172a] focus:bg-white focus:border-[#005c55] focus:outline-none transition-colors"
                  >
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="IMPS">IMPS</option>
                    <option value="NEFT/RTGS">NEFT / RTGS</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Card">Card</option>
                    <option value="DD">DD</option>
                  </select>
                </div>

                {/* 4. Receipt No. */}
                <div>
                  <label
                    htmlFor="collect-receipt-input"
                    className="block text-xs font-semibold text-[#0f172a] mb-1.5"
                  >
                    Receipt No.
                  </label>
                  <input
                    id="collect-receipt-input"
                    type="text"
                    aria-label="Receipt Number"
                    required
                    value={collectReceiptNo}
                    onChange={(e) => setCollectReceiptNo(e.target.value)}
                    className="w-full h-10 rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-3 text-xs font-semibold text-[#0f172a] tabular-nums focus:bg-white focus:border-[#005c55] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {inlineOverpayment > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-[#ffedd5] border border-[#fdba74] px-3.5 py-2.5 text-xs text-[#9a4a00]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Entered amount exceeds total remaining fee due (
                    {formatINR(totalRem)}) by{' '}
                    <strong>{formatINR(inlineOverpayment)}</strong>.
                  </span>
                </div>
              )}
            </div>

            {/* Card Footer: Summary + Primary Submit CTA */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f8fafc] border-t border-[#e2e8f0] px-6 py-3.5">
              <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
                <div>
                  <span className="text-[#475569]">Receiving Now: </span>
                  <strong className="text-[#006c49] text-sm">
                    {formatINR(numericCollectAmount)}
                  </strong>
                </div>
                <span className="text-[#cbd5e1]" aria-hidden="true">
                  |
                </span>
                <div>
                  <span className="text-[#475569]">Balance After Payment: </span>
                  <strong
                    className={
                      remainingAfterThisPayment > 0
                        ? 'text-[#9a4a00]'
                        : 'text-[#006c49]'
                    }
                  >
                    {formatINR(remainingAfterThisPayment)}
                    {isPartPayment ? ' (Partial-Paid)' : ''}
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCloseCollectForm}
                  className="h-9 rounded-xl bg-white border border-[#cbd5e1] px-4 text-xs font-semibold text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || numericCollectAmount <= 0}
                  className="inline-flex items-center gap-1.5 h-9 rounded-xl bg-[#005c55] px-5 text-xs font-bold text-white shadow-xs hover:bg-[#0f766e] disabled:opacity-50 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {submitting
                    ? 'Saving...'
                    : `Save ${formatINR(numericCollectAmount)} & Generate Receipt`}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* RECEIPTS SECTION */}
        <div className="space-y-6 pt-2">
          {/* Full Paid Receipt */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#131b2e]">
                Full Paid Receipt
              </h2>
              <span className="font-mono text-xs text-[#3e4947]">
                {fullPaidReceipts.length} receipt
                {fullPaidReceipts.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#f2f3ff]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#f2f3ff] bg-[#faf8ff] text-[11px] font-semibold text-[#3e4947]">
                    <th className="py-2.5 px-3 whitespace-nowrap">Date</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Header</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right font-mono">
                      Tuition Paid
                    </th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right font-mono">
                      Fine
                    </th>
                    <th className="py-2.5 px-3 whitespace-nowrap">
                      Receipt No &amp; Mode
                    </th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right no-print">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f3ff] text-[#3e4947]">
                  {fullPaidReceipts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-6 text-center text-xs text-[#3e4947]"
                      >
                        No full paid receipts generated yet for this student.
                      </td>
                    </tr>
                  ) : (
                    fullPaidReceipts.map((rcp) => (
                      <tr key={rcp.paymentId} className="hover:bg-[#faf8ff]">
                        <td className="py-3 px-3 font-mono whitespace-nowrap">
                          {rcp.paymentDate.replace(/\//g, '-')}
                        </td>
                        <td className="py-3 px-3 font-medium text-[#131b2e] whitespace-nowrap">
                          {rcp.allocatedToXI > 0 && rcp.allocatedToXII > 0
                            ? headerConfig.combinedHeadName
                            : rcp.allocatedToXI > 0
                            ? headerConfig.year1HeadName
                            : rcp.allocatedToXII > 0
                            ? headerConfig.year2HeadName
                            : rcp.installmentLabel}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-[#006c49] tabular-nums">
                          {formatINR(rcp.amount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {formatINR(rcp.fineAmount || 0)}
                        </td>
                        <td className="py-3 px-3 font-mono whitespace-nowrap">
                          {rcp.receiptNo} · {rcp.paymentMode}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap no-print">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPrintingReceipt(rcp)}
                              className="inline-flex items-center gap-1 rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-[11px] font-semibold text-[#131b2e] hover:bg-[#e2e7ff] transition-colors"
                            >
                              <Printer className="h-3 w-3 text-[#005c55]" />
                              Print (2 Copies)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReversingReceipt(rcp);
                                setReversalReason('');
                              }}
                              aria-label={`Reverse receipt ${rcp.receiptNo}`}
                              title="Reverse / Cancel Receipt"
                              className="rounded-xl bg-[#f2f3ff] p-1.5 text-[#3e4947] hover:bg-[#ffdad6] hover:text-[#ba1a1a] transition-colors"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* BOTTOM 2-COLUMN GRID: Lesser Paid Receipt + Reversal Receipt */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Lesser Paid Receipt */}
            <div className="space-y-2">
              <h2 className="font-display text-sm font-bold text-[#131b2e]">
                Lesser / Partial Paid Receipt
              </h2>
              <p className="text-xs text-[#3e4947]">
                Partial installments below a full term fee.
              </p>

              <div className="overflow-x-auto rounded-xl border border-[#f2f3ff]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#f2f3ff] bg-[#faf8ff] font-semibold text-[#3e4947]">
                      <th className="py-2.5 px-3 whitespace-nowrap">Date</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Receipt</th>
                      <th className="py-2.5 px-3 whitespace-nowrap font-mono">
                        Paid + Fine
                      </th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Mode</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-right no-print">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f2f3ff] text-[#3e4947]">
                    {lesserPaidReceipts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-5 text-center text-xs text-[#3e4947]"
                        >
                          No partial receipts recorded.
                        </td>
                      </tr>
                    ) : (
                      lesserPaidReceipts.map((rcp) => (
                        <tr key={rcp.paymentId} className="hover:bg-[#faf8ff]">
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                            {rcp.paymentDate.replace(/\//g, '-')}
                          </td>
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                            {rcp.receiptNo}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-[#131b2e] tabular-nums whitespace-nowrap">
                            {formatINR(rcp.amount)}
                            {rcp.fineAmount && rcp.fineAmount > 0
                              ? ` (+${formatINR(rcp.fineAmount)})`
                              : ''}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {rcp.paymentMode}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap no-print">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPrintingReceipt(rcp)}
                                className="rounded-xl bg-[#f2f3ff] px-2.5 py-1 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff]"
                              >
                                Print
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReversingReceipt(rcp);
                                  setReversalReason('');
                                }}
                                aria-label={`Reverse receipt ${rcp.receiptNo}`}
                                title="Reverse Receipt"
                                className="text-[#3e4947] hover:text-[#ba1a1a] p-1"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reversal Receipt (Persistent Audit Trail) */}
            <div className="space-y-2">
              <h2 className="font-display text-sm font-bold text-[#131b2e]">
                Reversal Receipt Audit Trail
              </h2>
              <p className="text-xs text-[#3e4947]">
                Cancelled vouchers retained permanently for accounting audit.
              </p>

              <div className="overflow-x-auto rounded-xl border border-[#f2f3ff]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#f2f3ff] bg-[#faf8ff] font-semibold text-[#3e4947]">
                      <th className="py-2.5 px-3 whitespace-nowrap">Receipt</th>
                      <th className="py-2.5 px-3 whitespace-nowrap font-mono">
                        Amount
                      </th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Reason</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-right no-print">
                        Print
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f2f3ff] text-[#3e4947]">
                    {studentReversedReceipts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-5 text-center text-xs text-[#3e4947]"
                        >
                          No reversed receipts.
                        </td>
                      </tr>
                    ) : (
                      studentReversedReceipts.map((rcp) => (
                        <tr
                          key={rcp.paymentId}
                          className="bg-[#ffdad6]/35 text-[#ba1a1a]"
                        >
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                            <div>{rcp.receiptNo}</div>
                            <div className="text-[10px] opacity-80">
                              {rcp.paymentDate}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono line-through whitespace-nowrap">
                            {formatINR(rcp.amount)}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] max-w-[180px] truncate">
                            {rcp.reversalReason || 'Cancelled by staff'}
                          </td>
                          <td className="py-2.5 px-3 text-right no-print">
                            <button
                              type="button"
                              onClick={() => setPrintingReceipt(rcp)}
                              className="rounded-xl bg-white px-2.5 py-1 text-xs font-semibold text-[#131b2e]"
                            >
                              Print
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRMED REVERSAL MODAL */}
      {reversingReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reverse-receipt-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#131b2e]/50 p-4 backdrop-blur-xs no-print"
        >
          <form
            onSubmit={handleConfirmReversal}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[#ffdad6] p-2.5 text-[#ba1a1a] shrink-0">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <h3
                  id="reverse-receipt-modal-title"
                  className="font-display text-sm font-bold text-[#131b2e]"
                >
                  Reverse Receipt {reversingReceipt.receiptNo}?
                </h3>
                <p className="mt-1 text-xs text-[#3e4947] leading-relaxed">
                  This will deduct{' '}
                  <strong className="font-mono text-[#131b2e]">
                    {formatINR(reversingReceipt.amount)}
                  </strong>{' '}
                  from {student.fullName}&rsquo;s ledger and keep a permanent
                  reversed audit entry.
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="reversal-reason-input"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Reversal Reason *
              </label>
              <input
                id="reversal-reason-input"
                type="text"
                required
                maxLength={200}
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="e.g. Cheque bounced, Duplicate entry, Wrong student"
                className="w-full rounded-xl border border-[#bdc9c6] px-3 py-2 text-xs text-[#131b2e] focus:border-[#005c55] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setReversingReceipt(null)}
                className="rounded-xl bg-[#f2f3ff] px-4 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reversingBusy || !reversalReason.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#ba1a1a] px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {reversingBusy ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TWO-COPY OFFICIAL PRINTABLE RECEIPT MODAL (SCHOOL COPY + PARENT COPY) */}
      {printingReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="print-receipt-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#131b2e]/50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 my-auto max-h-[94vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#f2f3ff] pb-3 no-print">
              <div>
                <h3
                  id="print-receipt-modal-title"
                  className="font-display text-sm font-bold text-[#131b2e]"
                >
                  Official Two-Copy Fee Receipt — {printingReceipt.receiptNo}
                </h3>
                <p className="text-[11px] text-[#3e4947]">
                  Prints cleanly on a single A4 page with Office Copy &amp;
                  Parent Copy.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close print preview"
                onClick={() => setPrintingReceipt(null)}
                className="rounded-lg p-1.5 text-[#3e4947] hover:bg-[#f2f3ff] hover:text-[#131b2e]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ISOLATED PRINT SHEET */}
            <div id="official-receipt-print-sheet" className="space-y-4">
              {renderReceiptCopyCard(
                headerConfig.officeCopyLabel,
                printingReceipt
              )}

              {/* Dashed Scissor Tear Line */}
              <div className="flex items-center gap-2 text-[10px] font-mono text-[#3e4947] py-1">
                <Scissors className="h-3.5 w-3.5 shrink-0" />
                <div className="flex-1 border-t border-dashed border-[#3e4947]/50" />
                <span>CUT HERE</span>
                <div className="flex-1 border-t border-dashed border-[#3e4947]/50" />
              </div>

              {renderReceiptCopyCard(
                headerConfig.parentCopyLabel,
                printingReceipt
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f2f3ff] no-print">
              <button
                type="button"
                onClick={() => setPrintingReceipt(null)}
                className="rounded-xl bg-[#f2f3ff] px-4 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handlePrintOfficialReceipt}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-2 text-xs font-bold text-white hover:bg-[#0f766e]"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Official Receipt (2 Copies)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
