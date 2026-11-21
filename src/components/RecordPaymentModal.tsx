import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  X,
  CheckCircle2,
  ArrowRight,
  IndianRupee,
  Receipt,
} from 'lucide-react';
import { AllocationTarget, PaymentMode, StudentRecord } from '../types';
import {
  calculatePaymentAllocation,
  computeDynamicRegisterCategory,
  computeNetYearFees,
  formatINR,
  formatToRegisterDate,
} from '../utils/ledgerLogic';

interface RecordPaymentModalProps {
  student: StudentRecord;
  selectedAY: string;
  defaultReceiptNo: string;
  onClose: () => void;
  onSubmitPayment: (payload: {
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
}

const PAYMENT_MODES: PaymentMode[] = [
  'UPI',
  'Cash',
  'NEFT/RTGS',
  'Cheque',
  'Card',
  'DD',
];

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  student,
  selectedAY,
  defaultReceiptNo,
  onClose,
  onSubmitPayment,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const { netClassXIFee, netClassXIIFee, totalIntegratedFee } = useMemo(
    () =>
      computeNetYearFees(
        student.classXIFee,
        student.classXIIFee,
        student.scholarshipDiscount
      ),
    [student.classXIFee, student.classXIIFee, student.scholarshipDiscount]
  );

  const remXI = Math.max(0, netClassXIFee - student.paidClassXI);
  const remXII = Math.max(0, netClassXIIFee - student.paidClassXII);
  const totalRem = Math.max(0, totalIntegratedFee - student.totalPaid);

  const defaultAmount = remXI > 0 ? remXI : remXII > 0 ? remXII : 10000;
  const defaultTarget: AllocationTarget =
    remXI > 0 && remXII === 0
      ? 'XI'
      : remXI === 0 && remXII > 0
      ? 'XII'
      : 'INTEGRATED';

  const [amountStr, setAmountStr] = useState<string>(String(defaultAmount));
  const [fineStr, setFineStr] = useState<string>('0');
  const [targetClass, setTargetClass] =
    useState<AllocationTarget>(defaultTarget);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('UPI');
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [receiptNo, setReceiptNo] = useState<string>(defaultReceiptNo);
  const [installmentLabel, setInstallmentLabel] = useState<string>(
    remXI > 0
      ? `Class XI - Science Fee (${student.enrollmentAY})`
      : `Class XII - Science Fee (${student.progressionAY})`
  );
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const numericAmount = Math.max(0, Math.round(Number(amountStr) || 0));
  const numericFine = Math.max(0, Math.round(Number(fineStr) || 0));
  const totalReceived = numericAmount + numericFine;
  const overpaymentExcess =
    numericAmount > totalRem ? numericAmount - totalRem : 0;

  const allocation = useMemo(
    () => calculatePaymentAllocation(student, numericAmount, targetClass),
    [student, numericAmount, targetClass]
  );

  const formattedRegDate = useMemo(
    () => formatToRegisterDate(paymentDate),
    [paymentDate]
  );

  const newXiDate =
    allocation.allocatedToXI > 0
      ? formattedRegDate
      : student.xiPaymentDate || '-';

  const newXiiDate =
    allocation.allocatedToXII > 0
      ? formattedRegDate
      : student.xiiPaymentDate || '-';

  const previewNextCategory = useMemo(() => {
    const updatedStudent: StudentRecord = {
      ...student,
      paidClassXI: allocation.newPaidClassXI,
      paidClassXII: allocation.newPaidClassXII,
      totalPaid: allocation.newTotalPaid,
      xiPaymentDate: newXiDate,
      xiiPaymentDate: newXiiDate,
    };
    return computeDynamicRegisterCategory(updatedStudent, selectedAY);
  }, [student, allocation, newXiDate, newXiiDate, selectedAY]);

  const handleQuickAmount = (
    val: number,
    label: string,
    mode: AllocationTarget
  ) => {
    setAmountStr(String(val));
    setInstallmentLabel(label);
    setTargetClass(mode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numericAmount <= 0) {
      setErrorMsg('Please enter a valid tuition fee amount greater than ₹0.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onSubmitPayment({
        student,
        amount: numericAmount,
        fineAmount: numericFine,
        targetClass,
        allocatedToXI: allocation.allocatedToXI,
        allocatedToXII: allocation.allocatedToXII,
        newPaidClassXI: allocation.newPaidClassXI,
        newPaidClassXII: allocation.newPaidClassXII,
        newTotalPaid: allocation.newTotalPaid,
        newXiDate,
        newXiiDate,
        newRemark: previewNextCategory,
        paymentDate: formattedRegDate,
        paymentMode,
        referenceNo: referenceNo.trim(),
        receiptNo: receiptNo.trim() || defaultReceiptNo,
        installmentLabel: installmentLabel.trim() || 'Integrated Science Fee',
        notes: notes.trim(),
        recordedInAY:
          selectedAY === 'ALL_BATCHES' ? student.enrollmentAY : selectedAY,
      });
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save fee payment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-payment-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#131b2e]/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Clean Light Modal Header */}
        <div className="flex items-center justify-between border-b border-[#f2f3ff] bg-[#faf8ff] px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-[#3e4947]">
              <span className="font-mono font-semibold text-[#131b2e]">
                {student.rollNo}
              </span>
              <span aria-hidden="true">·</span>
              <span>{student.centerName}</span>
              <span aria-hidden="true">·</span>
              <span>
                XI ({student.enrollmentAY}) → XII ({student.progressionAY})
              </span>
            </div>
            <h2
              id="record-payment-modal-title"
              className="mt-0.5 font-display text-lg font-bold text-[#131b2e]"
            >
              Collect Fee — {student.fullName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-[#3e4947] hover:bg-[#f2f3ff] hover:text-[#131b2e] transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="max-h-[82vh] overflow-y-auto p-6 space-y-5"
        >
          {/* Quick Presets */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-[#131b2e]">
                Quick Fee Presets
              </span>
              <span className="text-xs text-[#3e4947] font-mono tabular-nums">
                Status:{' '}
                <strong>
                  {computeDynamicRegisterCategory(student, selectedAY)}
                </strong>{' '}
                · Pending: {formatINR(totalRem)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {remXI > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    handleQuickAmount(
                      remXI,
                      `Class XI - Science Fee (${student.enrollmentAY})`,
                      'XI'
                    )
                  }
                  className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-xs font-medium text-[#131b2e] hover:bg-[#e2e7ff] transition-colors whitespace-nowrap"
                >
                  Pay Class XI ({formatINR(remXI)})
                </button>
              )}
              {remXII > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    handleQuickAmount(
                      remXII,
                      `Class XII - Science Fee (${student.progressionAY})`,
                      'XII'
                    )
                  }
                  className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-xs font-medium text-[#131b2e] hover:bg-[#e2e7ff] transition-colors whitespace-nowrap"
                >
                  Pay Class XII ({formatINR(remXII)})
                </button>
              )}
              {totalRem > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    handleQuickAmount(
                      totalRem,
                      'Complete Integrated Fee (Class XI + Class XII)',
                      'INTEGRATED'
                    )
                  }
                  className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-xs font-medium text-[#131b2e] hover:bg-[#e2e7ff] transition-colors whitespace-nowrap"
                >
                  Pay Both XI + XII ({formatINR(totalRem)})
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  handleQuickAmount(
                    5000,
                    'Partial Fee Installment (₹5,000)',
                    'INTEGRATED'
                  )
                }
                className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-xs font-medium text-[#131b2e] hover:bg-[#e2e7ff] transition-colors whitespace-nowrap"
              >
                + ₹5,000
              </button>
              <button
                type="button"
                onClick={() =>
                  handleQuickAmount(
                    10000,
                    'Standard Annual Fee (₹10,000)',
                    'INTEGRATED'
                  )
                }
                className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-xs font-medium text-[#131b2e] hover:bg-[#e2e7ff] transition-colors whitespace-nowrap"
              >
                + ₹10,000
              </button>
            </div>
          </div>

          {/* Primary Amount, Late Fine & Allocation */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
                Tuition Amount (₹) *
              </label>
              <div className="relative">
                <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#3e4947]" />
                <input
                  type="number"
                  min={1}
                  max={10000000}
                  required
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white py-2 pl-9 pr-3 font-mono text-base font-semibold text-[#131b2e] focus:border-[#005c55] focus:outline-none"
                  placeholder="10000"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
                Late Fine (₹)
              </label>
              <div className="relative">
                <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#3e4947]" />
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={fineStr}
                  onChange={(e) => setFineStr(e.target.value)}
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white py-2 pl-9 pr-3 font-mono text-base font-semibold text-[#131b2e] focus:border-[#005c55] focus:outline-none"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
                Allocate To Class *
              </label>
              <select
                value={targetClass}
                onChange={(e) =>
                  setTargetClass(e.target.value as AllocationTarget)
                }
                className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2.5 text-sm text-[#131b2e] focus:border-[#005c55] focus:outline-none"
              >
                <option value="INTEGRATED">
                  Auto-Sync (XI first → XII)
                </option>
                <option value="XI">Class XI ({student.enrollmentAY})</option>
                <option value="XII">Class XII ({student.progressionAY})</option>
              </select>
            </div>
          </div>

          {/* Overpayment Warning */}
          {overpaymentExcess > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[#ffdcc3]/60 px-4 py-3 text-xs text-[#7d4200]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">
                  Exceeds remaining balance by {formatINR(overpaymentExcess)}.
                </span>{' '}
                Remaining integrated due is {formatINR(totalRem)}. Double-check
                before saving if this is not an advance/adjustment.
              </div>
            </div>
          )}

          {/* Live Sync Preview */}
          <div className="rounded-2xl bg-[#faf8ff] border border-[#eaedff] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#005c55] shrink-0" />
                <span className="text-xs font-semibold text-[#131b2e]">
                  Live Cross-Year Sync Preview
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-[#3e4947]">
                  {computeDynamicRegisterCategory(student, selectedAY)}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-[#005c55]" />
                <span className="font-bold text-[#006c49]">
                  {previewNextCategory}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3 shadow-2xs">
                <div className="text-[11px] font-medium text-[#3e4947]">
                  Class XI ({student.enrollmentAY})
                </div>
                <div className="mt-1 flex items-center gap-1.5 font-mono text-sm font-semibold text-[#131b2e] tabular-nums">
                  <span>{formatINR(student.paidClassXI)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#bdc9c6]" />
                  <span className="text-[#006c49]">
                    {formatINR(allocation.newPaidClassXI)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-white p-3 shadow-2xs">
                <div className="text-[11px] font-medium text-[#3e4947]">
                  Class XII ({student.progressionAY})
                </div>
                <div className="mt-1 flex items-center gap-1.5 font-mono text-sm font-semibold text-[#131b2e] tabular-nums">
                  <span>{formatINR(student.paidClassXII)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#bdc9c6]" />
                  <span className="text-[#006c49]">
                    {formatINR(allocation.newPaidClassXII)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-white p-3 shadow-2xs">
                <div className="text-[11px] font-medium text-[#3e4947]">
                  Total Paid (XI + XII)
                </div>
                <div className="mt-1 flex items-center gap-1.5 font-mono text-sm font-semibold text-[#131b2e] tabular-nums">
                  <span>{formatINR(student.totalPaid)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#bdc9c6]" />
                  <span className="text-[#005c55]">
                    {formatINR(allocation.newTotalPaid)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Details */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
                Payment Date *
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-sm text-[#131b2e]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
                Payment Mode *
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-sm text-[#131b2e]"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
                Receipt Number *
              </label>
              <input
                type="text"
                required
                maxLength={50}
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-sm text-[#131b2e]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
                Particular / Description *
              </label>
              <input
                type="text"
                required
                maxLength={80}
                value={installmentLabel}
                onChange={(e) => setInstallmentLabel(e.target.value)}
                className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-sm text-[#131b2e]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
                UTR / Cheque / Reference No.
              </label>
              <input
                type="text"
                maxLength={80}
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="Optional reference"
                className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-sm text-[#131b2e]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
              Remarks / Notes
            </label>
            <input
              type="text"
              maxLength={300}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note (e.g. bank name, paid by parent)"
              className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-sm text-[#131b2e]"
            />
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-[#ffdad6] px-4 py-2.5 text-xs font-medium text-[#ba1a1a]">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-[#f2f3ff] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-[#f2f3ff] px-4 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff] transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#005c55] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0f766e] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Receipt className="h-4 w-4" />
              {submitting
                ? 'Saving...'
                : numericFine > 0
                ? `Save ${formatINR(totalReceived)} (incl. ${formatINR(numericFine)} fine)`
                : `Save ${formatINR(numericAmount)} & Sync`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
