import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  UserPlus,
  Save,
} from 'lucide-react';
import {
  ClassLevel,
  FeeStructureSettings,
  HeaderConfig,
  REGISTER_STATUS_CATEGORIES,
  STREAM_OPTIONS,
  StudentRecord,
  StudentStatus,
} from '../types';
import {
  computeNetYearFees,
  formatINR,
  getBatchHeadForAY,
  getEditablePhone,
  getNextAcademicYear,
  getStatusDisplayLabel,
  isPlaceholderPhone,
} from '../utils/ledgerLogic';

interface AddStudentPageProps {
  initialStudent?: StudentRecord | null;
  feeSettings: FeeStructureSettings;
  headerConfig: HeaderConfig;
  selectedAY: string;
  availableAYs: string[];
  nextSrNo: number;
  ownerId: string;
  onCancel: () => void;
  onSaveStudent: (
    studentData: Omit<StudentRecord, 'createdAt' | 'updatedAt'>,
    isEdit: boolean
  ) => Promise<void>;
}

export const AddStudentPage: React.FC<AddStudentPageProps> = ({
  initialStudent,
  feeSettings,
  headerConfig,
  selectedAY,
  availableAYs,
  nextSrNo,
  ownerId,
  onCancel,
  onSaveStudent,
}) => {
  const isEdit = Boolean(initialStudent);
  const defaultAY = selectedAY === 'ALL_BATCHES' ? '2026-27' : selectedAY;
  const hadPlaceholderPhone = Boolean(
    initialStudent && isPlaceholderPhone(initialStudent.phone)
  );

  const [rollNo, setRollNo] = useState<string>(
    initialStudent?.rollNo || `00013${String(nextSrNo).padStart(3, '0')}`
  );
  const [fullName, setFullName] = useState<string>(
    initialStudent?.fullName || ''
  );
  const [fatherName, setFatherName] = useState<string>(
    initialStudent?.fatherName || ''
  );
  const [phone, setPhone] = useState<string>(
    initialStudent ? getEditablePhone(initialStudent.phone) : ''
  );
  const [stream, setStream] = useState<string>(
    initialStudent?.stream || STREAM_OPTIONS[0]
  );
  const [enrollmentAY, setEnrollmentAY] = useState<string>(
    initialStudent?.enrollmentAY || defaultAY
  );
  const [admissionClass, setAdmissionClass] = useState<ClassLevel>(
    initialStudent?.admissionClass || 'XI'
  );
  const [classXIFeeStr, setClassXIFeeStr] = useState<string>(
    String(initialStudent?.classXIFee ?? feeSettings.classXIDefaultFee)
  );
  const [classXIIFeeStr, setClassXIIFeeStr] = useState<string>(
    String(initialStudent?.classXIIFee ?? feeSettings.classXIIDefaultFee)
  );
  const [scholarshipStr, setScholarshipStr] = useState<string>(
    String(initialStudent?.scholarshipDiscount ?? 0)
  );
  const [paidXIStr, setPaidXIStr] = useState<string>(
    String(initialStudent?.paidClassXI ?? 0)
  );
  const [paidXIIStr, setPaidXIIStr] = useState<string>(
    String(initialStudent?.paidClassXII ?? 0)
  );
  const [xiPaymentDate, setXiPaymentDate] = useState<string>(
    initialStudent?.xiPaymentDate || '-'
  );
  const [xiiPaymentDate, setXiiPaymentDate] = useState<string>(
    initialStudent?.xiiPaymentDate || '-'
  );
  const [status, setStatus] = useState<StudentStatus>(
    initialStudent?.status || 'active'
  );
  const [remarks, setRemarks] = useState<string>(
    initialStudent?.remarks || 'Fee Pending'
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const progressionAY = useMemo(
    () => getNextAcademicYear(enrollmentAY),
    [enrollmentAY]
  );

  const classXIFee = Math.max(0, Math.round(Number(classXIFeeStr) || 0));
  const classXIIFee = Math.max(0, Math.round(Number(classXIIFeeStr) || 0));
  const scholarshipDiscount = Math.max(
    0,
    Math.round(Number(scholarshipStr) || 0)
  );

  const { netClassXIFee, netClassXIIFee, totalIntegratedFee } = useMemo(
    () =>
      computeNetYearFees(
        admissionClass === 'XII' ? 0 : classXIFee,
        classXIIFee,
        scholarshipDiscount
      ),
    [admissionClass, classXIFee, classXIIFee, scholarshipDiscount]
  );

  const batchOptions = useMemo(
    () =>
      Array.from(
        new Set([
          '2025-26',
          '2026-27',
          '2027-28',
          ...availableAYs,
          enrollmentAY,
        ])
      )
        .filter((a) => a !== 'ALL_BATCHES')
        .sort(),
    [availableAYs, enrollmentAY]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Please enter the student full name.');
      return;
    }

    const paidClassXI = Math.max(0, Math.round(Number(paidXIStr) || 0));
    const paidClassXII = Math.max(0, Math.round(Number(paidXIIStr) || 0));
    const effectivePaidXI = admissionClass === 'XII' ? 0 : paidClassXI;
    const effectiveTotalPaid = effectivePaidXI + paidClassXII;

    const autoFather =
      fatherName.trim() ||
      (() => {
        const parts = fullName.trim().replace(/\s+/g, ' ').split(' ');
        return parts.length >= 3
          ? parts.slice(1).join(' ')
          : parts.length === 2
          ? parts[1]
          : fullName.trim();
      })();

    const finalStatus: StudentStatus =
      remarks === 'Admission Cancelled' ? 'dropped' : status;

    let derivedRemark = remarks.trim();
    if (finalStatus === 'dropped') {
      derivedRemark = 'Admission Cancelled';
    } else if (!isEdit) {
      if (admissionClass === 'XII' && paidClassXII >= netClassXIIFee && netClassXIIFee > 0) {
        derivedRemark = 'Direct XII Paid';
      } else if (effectiveTotalPaid >= totalIntegratedFee && totalIntegratedFee > 0) {
        derivedRemark = 'Full Paid';
      } else if (
        (effectivePaidXI > 0 && effectivePaidXI < netClassXIFee) ||
        (paidClassXII > 0 && paidClassXII < netClassXIIFee)
      ) {
        derivedRemark = 'Partial Paid (₹5k Due)';
      } else if (effectivePaidXI >= netClassXIFee && netClassXIFee > 0) {
        derivedRemark = 'Only XI Paid';
      } else if (effectiveTotalPaid === 0) {
        derivedRemark = 'Fee Pending';
      }
    }

    const todayDisplay = (() => {
      const d = new Date();
      return `${String(d.getDate()).padStart(2, '0')}/${String(
        d.getMonth() + 1
      ).padStart(2, '0')}/${d.getFullYear()}`;
    })();

    const finalXiDate =
      effectivePaidXI > 0 && (!xiPaymentDate.trim() || xiPaymentDate.trim() === '-')
        ? todayDisplay
        : xiPaymentDate.trim() || '-';
    const finalXiiDate =
      paidClassXII > 0 && (!xiiPaymentDate.trim() || xiiPaymentDate.trim() === '-')
        ? todayDisplay
        : xiiPaymentDate.trim() || '-';

    setSubmitting(true);
    try {
      await onSaveStudent(
        {
          studentId:
            initialStudent?.studentId ||
            `stu_reg_${String(nextSrNo).padStart(3, '0')}_${Date.now()
              .toString()
              .slice(-3)}`,
          ownerId,
          rollNo:
            rollNo.trim() || `00013${String(nextSrNo).padStart(3, '0')}`,
          fullName: fullName.trim(),
          fatherName: autoFather,
          phone: phone.trim(),
          stream: stream || STREAM_OPTIONS[0],
          centerName: `Batch ${enrollmentAY}`,
          enrollmentAY,
          progressionAY,
          admissionClass,
          classXIFee: admissionClass === 'XII' ? 0 : classXIFee,
          classXIIFee,
          scholarshipDiscount,
          totalIntegratedFee,
          paidClassXI: effectivePaidXI,
          paidClassXII,
          totalPaid: effectiveTotalPaid,
          xiPaymentDate: finalXiDate,
          xiiPaymentDate: finalXiiDate,
          status: finalStatus,
          remarks: derivedRemark || 'Fee Pending',
        },
        isEdit
      );
      onCancel();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save student record.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Top Back Navigation & Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#005c55] hover:text-[#0f766e] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Students
          </button>
          <h1 className="font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#131b2e]">
            {isEdit ? 'Edit Student Record' : 'Add New Student'}
          </h1>
          <p className="text-sm text-[#3e4947]">
            {isEdit
              ? 'Update student personal details, admission batch, fee structure, or payment ledger.'
              : 'Register a new student in the 2-year Integrated Science program with automatic Class XI → Class XII sync.'}
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-xl bg-[#e6f7ef] px-3.5 py-2 text-xs font-mono font-semibold text-[#005c55]">
          <UserPlus className="h-4 w-4 shrink-0" />
          <span>
            {enrollmentAY} (XI) → {progressionAY} (XII)
          </span>
        </div>
      </div>

      {/* Main Dedicated Full-Page Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white p-6 sm:p-7 shadow-[0_1px_10px_rgba(19,27,46,0.05)] border border-[#e6ebf5] space-y-6"
      >
        {/* Section 1: Batch & Program Link */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between border-b border-[#f2f3ff] pb-2.5">
            <h2 className="font-display text-sm font-bold text-[#131b2e]">
              1. Admission Batch &amp; Class
            </h2>
            <span className="text-xs font-medium text-[#3e4947]">
              {getBatchHeadForAY(headerConfig, enrollmentAY).batchTitle}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="student-admission-ay"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Admission Year (Batch) *
              </label>
              <select
                id="student-admission-ay"
                value={enrollmentAY}
                onChange={(e) => setEnrollmentAY(e.target.value)}
                className="w-full h-10 rounded-xl border border-[#bdc9c6] bg-white px-3 font-mono text-xs font-bold text-[#131b2e] focus:border-[#005c55] focus:outline-none"
              >
                {batchOptions.map((ay) => (
                  <option key={ay} value={ay}>
                    {ay} ({getBatchHeadForAY(headerConfig, ay).batchTitle})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="student-admission-class"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Admission Class *
              </label>
              <select
                id="student-admission-class"
                value={admissionClass}
                onChange={(e) => {
                  const c = e.target.value as ClassLevel;
                  setAdmissionClass(c);
                  if (c === 'XII') {
                    setClassXIFeeStr('0');
                    setPaidXIStr('0');
                    setRemarks('Direct XII Paid');
                  } else {
                    setClassXIFeeStr(String(feeSettings.classXIDefaultFee));
                  }
                }}
                className="w-full h-10 rounded-xl border border-[#bdc9c6] bg-white px-3 text-xs font-medium text-[#131b2e] focus:border-[#005c55] focus:outline-none"
              >
                <option value="XI">Class XI (2-Year Integrated)</option>
                <option value="XII">Class XII (Direct Admission)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="student-stream"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Section / Stream
              </label>
              <select
                id="student-stream"
                value={stream}
                onChange={(e) => setStream(e.target.value)}
                className="w-full h-10 rounded-xl border border-[#bdc9c6] bg-white px-3 text-xs font-medium text-[#131b2e] focus:border-[#005c55] focus:outline-none"
              >
                {STREAM_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#faf8ff] border border-[#eaedff] px-3.5 py-2.5 text-xs text-[#3e4947]">
            <span className="font-semibold text-[#131b2e]">Auto-Promotion:</span>
            <span className="font-mono font-semibold text-[#005c55]">
              {enrollmentAY} ({headerConfig.year1ShortLabel})
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-[#005c55]" />
            <span className="font-mono font-semibold text-[#005c55]">
              {progressionAY} ({headerConfig.year2ShortLabel})
            </span>
          </div>
        </section>

        {/* Section 2: Student Personal Details */}
        <section className="space-y-3.5">
          <div className="border-b border-[#f2f3ff] pb-2.5">
            <h2 className="font-display text-sm font-bold text-[#131b2e]">
              2. Student &amp; Parent Details
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="student-ec-no"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                EC No. / Roll No. *
              </label>
              <input
                id="student-ec-no"
                type="text"
                required
                value={rollNo}
                onChange={(e) => setRollNo(e.target.value)}
                className="w-full h-10 rounded-xl border border-[#bdc9c6] bg-white px-3 font-mono text-xs font-semibold text-[#131b2e] focus:border-[#005c55] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="student-full-name"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Student Full Name *
              </label>
              <input
                id="student-full-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rohan Sanjay Deshmukh"
                className="w-full h-10 rounded-xl border border-[#bdc9c6] bg-white px-3 text-xs text-[#131b2e] focus:border-[#005c55] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="student-father-name"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Father / Parent Name
              </label>
              <input
                id="student-father-name"
                type="text"
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                placeholder="Auto-detected from middle/last name if left blank"
                className="w-full h-10 rounded-xl border border-[#bdc9c6] bg-white px-3 text-xs text-[#131b2e] focus:border-[#005c55] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="student-phone"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Parent Mobile Number
              </label>
              <input
                id="student-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit parent mobile number"
                className={`w-full h-10 rounded-xl border px-3 font-mono text-xs text-[#131b2e] focus:border-[#005c55] focus:outline-none ${
                  hadPlaceholderPhone && !phone
                    ? 'border-[#7d4200]/50 bg-[#ffdcc3]/15'
                    : 'border-[#bdc9c6] bg-white'
                }`}
              />
              {hadPlaceholderPhone && !phone && (
                <p className="mt-1 text-[11px] font-medium text-[#7d4200]">
                  Placeholder phone cleared — please enter real parent mobile.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Section 3: Fee Schedule & Opening Payments */}
        <section className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f2f3ff] pb-2.5">
            <h2 className="font-display text-sm font-bold text-[#131b2e]">
              3. Fee Structure &amp; Opening Payment (Optional)
            </h2>
            <span className="font-mono text-xs font-bold text-[#005c55] tabular-nums">
              Net Payable: {formatINR(totalIntegratedFee)} (XI:{' '}
              {formatINR(netClassXIFee)} · XII: {formatINR(netClassXIIFee)})
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="student-xi-fee"
                className="block text-xs font-semibold text-[#3e4947] mb-1.5"
              >
                Class XI Fee (₹)
              </label>
              <input
                id="student-xi-fee"
                type="number"
                min={0}
                disabled={admissionClass === 'XII'}
                value={admissionClass === 'XII' ? '0' : classXIFeeStr}
                onChange={(e) => setClassXIFeeStr(e.target.value)}
                className="w-full h-10 rounded-xl border border-[#bdc9c6] bg-white px-3 font-mono text-xs font-semibold text-[#131b2e] disabled:bg-[#f2f3ff] disabled:text-[#3e4947]"
              />
            </div>

            <div>
              <label
                htmlFor="student-xii-fee"
                className="block text-xs font-semibold text-[#3e4947] mb-1.5"
              >
                Class XII Fee (₹)
              </label>
              <input
                id="student-xii-fee"
                type="number"
                min={0}
                value={classXIIFeeStr}
                onChange={(e) => setClassXIIFeeStr(e.target.value)}
                className="w-full h-10 rounded-xl border border-[#bdc9c6] bg-white px-3 font-mono text-xs font-semibold text-[#131b2e]"
              />
            </div>

            <div>
              <label
                htmlFor="student-scholarship"
                className="block text-xs font-semibold text-[#3e4947] mb-1.5"
              >
                Scholarship / Discount (₹)
              </label>
              <input
                id="student-scholarship"
                type="number"
                min={0}
                value={scholarshipStr}
                onChange={(e) => setScholarshipStr(e.target.value)}
                className="w-full h-10 rounded-xl border border-[#bdc9c6] bg-white px-3 font-mono text-xs font-semibold text-[#006c49]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-[#faf8ff] border border-[#eaedff] p-4 space-y-2.5">
              <div className="text-xs font-bold text-[#131b2e]">
                {headerConfig.year1HeadName} ({enrollmentAY})
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="student-xi-paid"
                    className="block text-[11px] font-medium text-[#3e4947] mb-1"
                  >
                    XI Paid (₹)
                  </label>
                  <input
                    id="student-xi-paid"
                    type="number"
                    min={0}
                    disabled={admissionClass === 'XII'}
                    value={admissionClass === 'XII' ? '0' : paidXIStr}
                    onChange={(e) => setPaidXIStr(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#bdc9c6] bg-white px-2.5 font-mono text-xs font-bold text-[#131b2e] disabled:bg-[#f2f3ff]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="student-xi-date"
                    className="block text-[11px] font-medium text-[#3e4947] mb-1"
                  >
                    XI Payment Date
                  </label>
                  <input
                    id="student-xi-date"
                    type="text"
                    value={xiPaymentDate}
                    onChange={(e) => setXiPaymentDate(e.target.value)}
                    placeholder="DD/MM/YYYY or -"
                    className="w-full h-9 rounded-lg border border-[#bdc9c6] bg-white px-2.5 font-mono text-xs text-[#131b2e]"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-[#faf8ff] border border-[#eaedff] p-4 space-y-2.5">
              <div className="text-xs font-bold text-[#131b2e]">
                {headerConfig.year2HeadName} ({progressionAY})
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="student-xii-paid"
                    className="block text-[11px] font-medium text-[#3e4947] mb-1"
                  >
                    XII Paid (₹)
                  </label>
                  <input
                    id="student-xii-paid"
                    type="number"
                    min={0}
                    value={paidXIIStr}
                    onChange={(e) => setPaidXIIStr(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#bdc9c6] bg-white px-2.5 font-mono text-xs font-bold text-[#131b2e]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="student-xii-date"
                    className="block text-[11px] font-medium text-[#3e4947] mb-1"
                  >
                    XII Payment Date
                  </label>
                  <input
                    id="student-xii-date"
                    type="text"
                    value={xiiPaymentDate}
                    onChange={(e) => setXiiPaymentDate(e.target.value)}
                    placeholder="DD/MM/YYYY or -"
                    className="w-full h-9 rounded-lg border border-[#bdc9c6] bg-white px-2.5 font-mono text-xs text-[#131b2e]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="student-status"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Enrollment Status
              </label>
              <select
                id="student-status"
                value={status}
                onChange={(e) => {
                  const nextStatus = e.target.value as StudentStatus;
                  setStatus(nextStatus);
                  if (nextStatus === 'dropped') {
                    setRemarks('Admission Cancelled');
                  } else if (remarks === 'Admission Cancelled') {
                    setRemarks('Fee Pending');
                  }
                }}
                className="w-full h-10 rounded-xl border border-[#bdc9c6] bg-white px-3 text-xs font-medium text-[#131b2e]"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="dropped">Dropped / Cancelled</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="student-remark"
                className="block text-xs font-semibold text-[#131b2e] mb-1.5"
              >
                Fee Status / Remark
              </label>
              <select
                id="student-remark"
                value={remarks}
                onChange={(e) => {
                  const val = e.target.value;
                  setRemarks(val);
                  if (val === 'Admission Cancelled') {
                    setStatus('dropped');
                  } else if (status === 'dropped') {
                    setStatus('active');
                  }
                }}
                className="w-full h-10 rounded-xl border border-[#bdc9c6] bg-white px-3 text-xs text-[#131b2e]"
              >
                {REGISTER_STATUS_CATEGORIES.map((c) => (
                  <option key={c.category} value={c.category}>
                    {getStatusDisplayLabel(headerConfig, c.category)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl bg-[#ffdad6] px-4 py-2.5 text-xs font-semibold text-[#ba1a1a]"
          >
            {errorMsg}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-[#f2f3ff]">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-xl bg-[#f2f3ff] px-5 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 h-10 rounded-xl bg-[#005c55] px-6 text-xs font-semibold text-white shadow-xs hover:bg-[#0f766e] disabled:opacity-60 transition-colors"
          >
            {isEdit ? (
              <Save className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span>
              {submitting
                ? 'Saving...'
                : isEdit
                ? 'Save Changes'
                : 'Add Student'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
