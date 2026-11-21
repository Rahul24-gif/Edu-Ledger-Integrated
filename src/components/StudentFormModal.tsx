import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  X,
  UserPlus,
  Upload,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import {
  ClassLevel,
  FeeStructureSettings,
  ImportConflictRow,
  REGISTER_STATUS_CATEGORIES,
  STREAM_OPTIONS,
  StudentRecord,
  StudentStatus,
} from '../types';
import {
  computeNetYearFees,
  formatINR,
  getEditablePhone,
  getNextAcademicYear,
  isPlaceholderPhone,
  reconcileImportedStudents,
} from '../utils/ledgerLogic';
import {
  downloadStudentImportExcelTemplate,
  parseStudentExcelFile,
} from '../utils/excelUtils';

interface StudentFormModalProps {
  initialStudent?: StudentRecord | null;
  existingStudents: StudentRecord[];
  feeSettings: FeeStructureSettings;
  selectedAY: string;
  availableAYs: string[];
  nextSrNo: number;
  ownerId: string;
  defaultTab?: 'single' | 'bulk';
  onClose: () => void;
  onSaveStudent: (
    studentData: Omit<StudentRecord, 'createdAt' | 'updatedAt'>,
    isEdit: boolean
  ) => Promise<void>;
  onBulkImportStudents: (
    conflicts: ImportConflictRow[],
    duplicateStrategy: 'skip' | 'update'
  ) => Promise<void>;
}

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  initialStudent,
  existingStudents,
  feeSettings,
  selectedAY,
  availableAYs,
  nextSrNo,
  ownerId,
  defaultTab = 'single',
  onClose,
  onSaveStudent,
  onBulkImportStudents,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const isEdit = Boolean(initialStudent);
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>(defaultTab);

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
  const [stream] = useState<string>(initialStudent?.stream || STREAM_OPTIONS[0]);
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
    String(initialStudent?.paidClassXI ?? feeSettings.classXIDefaultFee)
  );
  const [paidXIIStr, setPaidXIIStr] = useState<string>(
    String(initialStudent?.paidClassXII ?? 0)
  );
  const [xiPaymentDate, setXiPaymentDate] = useState<string>(
    initialStudent?.xiPaymentDate ||
      `10/06/${(initialStudent?.enrollmentAY || defaultAY).slice(0, 4)}`
  );
  const [xiiPaymentDate, setXiiPaymentDate] = useState<string>(
    initialStudent?.xiiPaymentDate || '-'
  );
  const [status, setStatus] = useState<StudentStatus>(
    initialStudent?.status || 'active'
  );
  const [remarks, setRemarks] = useState<string>(
    initialStudent?.remarks || 'Only XI Paid'
  );

  // Bulk Excel Upload / Paste State + Duplicate Conflict Reconciliation
  const [bulkBatchAY, setBulkBatchAY] = useState<string>(defaultAY);
  const [bulkText, setBulkText] = useState<string>('');
  const [excelParsedRows, setExcelParsedRows] = useState<
    Omit<StudentRecord, 'createdAt' | 'updatedAt'>[]
  >([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update'>(
    'skip'
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

  // Build parsed rows from either uploaded Excel OR pasted text for unified conflict preview
  const pastedRows = useMemo<
    Omit<StudentRecord, 'createdAt' | 'updatedAt'>[]
  >(() => {
    if (excelParsedRows.length > 0) return [];
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    const targetNextAY = getNextAcademicYear(bulkBatchAY);
    const out: Omit<StudentRecord, 'createdAt' | 'updatedAt'>[] = [];

    lines.forEach((line, idx) => {
      const parts = line.includes('\t')
        ? line.split('\t').map((p) => p.trim())
        : line.split(',').map((p) => p.trim());

      if (
        parts[0]?.toLowerCase() === 'sr. no.' ||
        parts[0]?.toLowerCase() === 'student name' ||
        parts[1]?.toLowerCase() === 'student name'
      ) {
        return;
      }

      const name = parts[0] || `Student ${nextSrNo + idx}`;
      const father =
        parts[1] ||
        (() => {
          const w = name.split(' ');
          return w.length >= 2 ? w.slice(1).join(' ') : name;
        })();
      const xiPaidVal =
        Number((parts[2] || String(feeSettings.classXIDefaultFee)).replace(/[^0-9]/g, '')) || 0;
      const xiiPaidVal = Number((parts[3] || '0').replace(/[^0-9]/g, '')) || 0;
      const phoneVal = (parts[4] || '').trim();
      const totPaid = xiPaidVal + xiiPaidVal;
      const totFee =
        feeSettings.classXIDefaultFee + feeSettings.classXIIDefaultFee;

      out.push({
        studentId: `stu_imp_${Date.now()}_${idx}`,
        ownerId,
        rollNo: `00013${String(nextSrNo + idx).padStart(3, '0')}`,
        fullName: name,
        fatherName: father,
        phone: phoneVal,
        stream: 'Science (Integrated)',
        centerName: `Batch ${bulkBatchAY}`,
        enrollmentAY: bulkBatchAY,
        progressionAY: targetNextAY,
        admissionClass: 'XI',
        classXIFee: feeSettings.classXIDefaultFee,
        classXIIFee: feeSettings.classXIIDefaultFee,
        scholarshipDiscount: 0,
        totalIntegratedFee: totFee,
        paidClassXI: xiPaidVal,
        paidClassXII: xiiPaidVal,
        totalPaid: totPaid,
        xiPaymentDate: xiPaidVal > 0 ? `10/06/${bulkBatchAY.slice(0, 4)}` : '-',
        xiiPaymentDate:
          xiiPaidVal > 0 ? `10/06/${targetNextAY.slice(0, 4)}` : '-',
        status: 'active',
        remarks:
          totPaid >= totFee && totFee > 0
            ? 'Full Paid'
            : xiPaidVal > 0
            ? 'Only XI Paid'
            : 'Fee Pending',
      });
    });

    return out;
  }, [excelParsedRows.length, bulkText, bulkBatchAY, nextSrNo, ownerId, feeSettings]);

  const activeIncomingRows =
    excelParsedRows.length > 0 ? excelParsedRows : pastedRows;

  const conflictRows = useMemo(
    () => reconcileImportedStudents(activeIncomingRows, existingStudents),
    [activeIncomingRows, existingStudents]
  );

  const conflictStats = useMemo(() => {
    let newCount = 0;
    let duplicateCount = 0;
    let missingPhoneCount = 0;
    conflictRows.forEach((row) => {
      if (row.matchType === 'new') newCount += 1;
      else duplicateCount += 1;
      if (row.missingPhone) missingPhoneCount += 1;
    });
    return { newCount, duplicateCount, missingPhoneCount };
  }, [conflictRows]);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Please enter the student full name.');
      return;
    }

    const paidClassXI = Math.max(0, Math.round(Number(paidXIStr) || 0));
    const paidClassXII = Math.max(0, Math.round(Number(paidXIIStr) || 0));

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
    const finalRemarks =
      finalStatus === 'dropped'
        ? 'Admission Cancelled'
        : remarks.trim() || 'Only XI Paid';

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
          stream,
          centerName: `Batch ${enrollmentAY}`,
          enrollmentAY,
          progressionAY,
          admissionClass,
          classXIFee: admissionClass === 'XII' ? 0 : classXIFee,
          classXIIFee,
          scholarshipDiscount,
          totalIntegratedFee,
          paidClassXI: admissionClass === 'XII' ? 0 : paidClassXI,
          paidClassXII,
          totalPaid:
            (admissionClass === 'XII' ? 0 : paidClassXI) + paidClassXII,
          xiPaymentDate: xiPaymentDate.trim() || '-',
          xiiPaymentDate: xiiPaymentDate.trim() || '-',
          status: finalStatus,
          remarks: finalRemarks,
        },
        isEdit
      );
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save student ledger.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleExcelFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rows = await parseStudentExcelFile(
        file,
        bulkBatchAY,
        nextSrNo,
        feeSettings.classXIDefaultFee,
        feeSettings.classXIIDefaultFee
      );
      if (rows.length === 0) {
        setErrorMsg(
          'Could not find student rows in the Excel file. Check column headers.'
        );
        return;
      }
      setExcelParsedRows(rows);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Error reading Excel file.'
      );
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (conflictRows.length === 0) {
      setErrorMsg(
        'Please upload an Excel (.xlsx / .csv) file OR paste student lines below.'
      );
      return;
    }

    if (duplicateStrategy === 'skip' && conflictStats.newCount === 0) {
      setErrorMsg(
        'All uploaded rows already exist in the register. Switch to "Update Existing" if you want to refresh them.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await onBulkImportStudents(conflictRows, duplicateStrategy);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to import students.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#131b2e]/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-form-modal-title"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Clean Light Modal Header */}
        <div className="flex items-center justify-between border-b border-[#f2f3ff] bg-[#faf8ff] px-6 py-4">
          <div>
            <h2
              id="student-form-modal-title"
              className="font-display text-base font-bold text-[#131b2e]"
            >
              {isEdit
                ? `Edit Student — ${initialStudent?.fullName}`
                : 'Add Student / Import Excel'}
            </h2>
            <p className="text-xs text-[#3e4947] mt-0.5">
              Assign Admission Year (2025-26, 2026-27, etc.) to link Class XI
              &amp; Class XII automatically.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="rounded-xl p-1.5 text-[#3e4947] hover:bg-[#f2f3ff] hover:text-[#131b2e] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        {!isEdit && (
          <div className="flex border-b border-[#f2f3ff] bg-white px-6 py-2.5 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('single')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'single'
                  ? 'bg-[#005c55] text-white'
                  : 'bg-[#f2f3ff] text-[#3e4947] hover:text-[#131b2e]'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Single Student
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bulk')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'bulk'
                  ? 'bg-[#005c55] text-white'
                  : 'bg-[#f2f3ff] text-[#3e4947] hover:text-[#131b2e]'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Import Excel (.xlsx / .csv)
            </button>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto p-6 flex-1">
          {activeTab === 'single' ? (
            <form onSubmit={handleSingleSubmit} className="space-y-4">
              {/* Batch Selection Box */}
              <div className="rounded-2xl bg-[#faf8ff] border border-[#eaedff] p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#131b2e] mb-1">
                      1. Admission Year (Batch) *
                    </label>
                    <select
                      value={enrollmentAY}
                      onChange={(e) => setEnrollmentAY(e.target.value)}
                      className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs font-bold text-[#131b2e]"
                    >
                      {Array.from(
                        new Set([
                          '2025-26',
                          '2026-27',
                          '2027-28',
                          ...availableAYs,
                          enrollmentAY,
                        ])
                      )
                        .filter((a) => a !== 'ALL_BATCHES')
                        .sort()
                        .map((ay) => (
                          <option key={ay} value={ay}>
                            {ay}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#131b2e] mb-1">
                      2-Year Auto-Promotion Link
                    </label>
                    <div className="flex items-center gap-2 rounded-xl bg-white border border-[#eaedff] px-3 py-2 text-xs font-mono font-semibold text-[#005c55]">
                      <span>{enrollmentAY} (XI)</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                      <span>{progressionAY} (XII)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Student Details */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-[#131b2e] mb-1">
                    EC No. / Roll No. *
                  </label>
                  <input
                    type="text"
                    required
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value)}
                    className="w-full rounded-xl border border-[#bdc9c6] px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#131b2e] mb-1">
                    Student Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Anshuman Atul Singh"
                    className="w-full rounded-xl border border-[#bdc9c6] px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-[#131b2e] mb-1">
                    Father Name
                  </label>
                  <input
                    type="text"
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    placeholder="Auto-detected if blank"
                    className="w-full rounded-xl border border-[#bdc9c6] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#131b2e] mb-1">
                    Parent Mobile Number
                  </label>
                  <input
                    type="text"
                    aria-label="Parent Mobile Number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter real parent mobile"
                    className={`w-full rounded-xl border px-3 py-2 font-mono text-xs ${
                      hadPlaceholderPhone && !phone
                        ? 'border-[#7d4200]/50 bg-[#ffdcc3]/15'
                        : 'border-[#bdc9c6]'
                    }`}
                  />
                  {hadPlaceholderPhone && !phone && (
                    <div className="mt-1 text-[10px] font-medium text-[#7d4200]">
                      Placeholder number cleared — enter real parent mobile.
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#131b2e] mb-1">
                    Admission Class
                  </label>
                  <select
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
                    className="w-full rounded-xl border border-[#bdc9c6] px-3 py-2 text-xs"
                  >
                    <option value="XI">Class XI (2-Yr Integrated)</option>
                    <option value="XII">Class XII (Direct XII)</option>
                  </select>
                </div>
              </div>

              {/* Editable Fee Structure & Scholarship Discount */}
              <div className="rounded-2xl bg-[#faf8ff] border border-[#eaedff] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#131b2e]">
                    Fee Structure, Scholarship &amp; Payments
                  </span>
                  <span className="font-mono text-xs font-bold text-[#005c55] tabular-nums">
                    Net Payable: {formatINR(totalIntegratedFee)} (XI:{' '}
                    {formatINR(netClassXIFee)} · XII: {formatINR(netClassXIIFee)})
                  </span>
                </div>

                {/* Editable Fee Schedule Row */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#3e4947] mb-1">
                      Class XI Fee (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      disabled={admissionClass === 'XII'}
                      value={admissionClass === 'XII' ? '0' : classXIFeeStr}
                      onChange={(e) => setClassXIFeeStr(e.target.value)}
                      className="w-full rounded-lg border border-[#bdc9c6] bg-white px-2.5 py-1.5 font-mono text-xs font-semibold disabled:bg-[#f2f3ff] disabled:text-[#3e4947]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#3e4947] mb-1">
                      Class XII Fee (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={classXIIFeeStr}
                      onChange={(e) => setClassXIIFeeStr(e.target.value)}
                      className="w-full rounded-lg border border-[#bdc9c6] bg-white px-2.5 py-1.5 font-mono text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#3e4947] mb-1">
                      Scholarship / Discount (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={scholarshipStr}
                      onChange={(e) => setScholarshipStr(e.target.value)}
                      className="w-full rounded-lg border border-[#bdc9c6] bg-white px-2.5 py-1.5 font-mono text-xs font-semibold text-[#006c49]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-white p-3 space-y-2 shadow-2xs">
                    <div className="text-xs font-bold text-[#131b2e]">
                      Class XI ({enrollmentAY})
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-[#3e4947]">
                          XI Paid (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={paidXIStr}
                          onChange={(e) => setPaidXIStr(e.target.value)}
                          className="w-full rounded-lg border border-[#bdc9c6] px-2 py-1.5 font-mono text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#3e4947]">
                          XI Date
                        </label>
                        <input
                          type="text"
                          value={xiPaymentDate}
                          onChange={(e) => setXiPaymentDate(e.target.value)}
                          placeholder="DD/MM/YYYY"
                          className="w-full rounded-lg border border-[#bdc9c6] px-2 py-1.5 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white p-3 space-y-2 shadow-2xs">
                    <div className="text-xs font-bold text-[#131b2e]">
                      Class XII ({progressionAY})
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-[#3e4947]">
                          XII Paid (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={paidXIIStr}
                          onChange={(e) => setPaidXIIStr(e.target.value)}
                          className="w-full rounded-lg border border-[#bdc9c6] px-2 py-1.5 font-mono text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#3e4947]">
                          XII Date
                        </label>
                        <input
                          type="text"
                          value={xiiPaymentDate}
                          onChange={(e) => setXiiPaymentDate(e.target.value)}
                          placeholder="DD/MM/YYYY or -"
                          className="w-full rounded-lg border border-[#bdc9c6] px-2 py-1.5 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enrollment Status & Register Category */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#131b2e] mb-1">
                      Enrollment Status
                    </label>
                    <select
                      aria-label="Enrollment Status"
                      value={status}
                      onChange={(e) => {
                        const nextStatus = e.target.value as StudentStatus;
                        setStatus(nextStatus);
                        if (nextStatus === 'dropped') {
                          setRemarks('Admission Cancelled');
                        } else if (remarks === 'Admission Cancelled') {
                          setRemarks('Only XI Paid');
                        }
                      }}
                      className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs font-medium"
                    >
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="dropped">Dropped / Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#131b2e] mb-1">
                      Register Remark / Category
                    </label>
                    <select
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
                      className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs"
                    >
                      {REGISTER_STATUS_CATEGORIES.map((c) => (
                        <option key={c.category} value={c.category}>
                          {c.category} — {c.description}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl bg-[#ffdad6] px-3 py-2 text-xs font-medium text-[#ba1a1a]">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#f2f3ff]">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-[#f2f3ff] px-4 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0f766e] disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {submitting
                    ? 'Saving...'
                    : isEdit
                    ? 'Update Student'
                    : 'Create Student Ledger'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleBulkSubmit} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#faf8ff] border border-[#eaedff] p-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-[#131b2e]">
                    Target Admission Year:
                  </label>
                  <select
                    value={bulkBatchAY}
                    onChange={(e) => setBulkBatchAY(e.target.value)}
                    className="rounded-xl border border-[#bdc9c6] bg-white px-2.5 py-1.5 font-mono text-xs font-bold"
                  >
                    {Array.from(
                      new Set([
                        '2025-26',
                        '2026-27',
                        '2027-28',
                        ...availableAYs,
                      ])
                    )
                      .filter((a) => a !== 'ALL_BATCHES')
                      .sort()
                      .map((ay) => (
                        <option key={ay} value={ay}>
                          {ay}
                        </option>
                      ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadStudentImportExcelTemplate(
                      bulkBatchAY,
                      feeSettings.classXIDefaultFee,
                      feeSettings.classXIIDefaultFee
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-[#131b2e] shadow-2xs hover:bg-[#f2f3ff]"
                >
                  <Download className="h-3.5 w-3.5 text-[#005c55]" />
                  Download Excel Template
                </button>
              </div>

              <div className="rounded-2xl border-2 border-dashed border-[#005c55]/30 bg-[#faf8ff] p-5 text-center space-y-2.5">
                <FileSpreadsheet className="h-7 w-7 text-[#005c55] mx-auto" />
                <div className="text-xs font-bold text-[#131b2e]">
                  Option 1: Upload Excel File (.xlsx, .xls, or .csv)
                </div>
                <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e]">
                  <Upload className="h-3.5 w-3.5" />
                  Select Excel File
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleExcelFileChange}
                    className="hidden"
                  />
                </label>
                {excelParsedRows.length > 0 && (
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <span className="text-xs font-bold text-[#006c49]">
                      {excelParsedRows.length} rows parsed from Excel
                    </span>
                    <button
                      type="button"
                      onClick={() => setExcelParsedRows([])}
                      className="text-xs text-[#3e4947] underline hover:text-[#131b2e]"
                    >
                      Clear file
                    </button>
                  </div>
                )}
              </div>

              {excelParsedRows.length === 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#131b2e] mb-1">
                    Option 2: Copy-Paste Rows (Student Name, Father Name, XI
                    Paid, XII Paid, Mobile)
                  </label>
                  <textarea
                    rows={3}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={`Aarav Rajesh Sharma, Rajesh Sharma, 10000, 0, 9820155101\nSneha Pramod Kulkarni, Pramod Kulkarni, 10000, 10000, 9820155102`}
                    className="w-full rounded-xl border border-[#bdc9c6] p-2.5 font-mono text-xs"
                  />
                </div>
              )}

              {/* Duplicate-Safe Conflict Preview */}
              {conflictRows.length > 0 && (
                <div className="rounded-2xl border border-[#eaedff] bg-[#faf8ff] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-[#131b2e]">
                      Import Conflict Check ({conflictRows.length} rows)
                    </div>
                    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                      <span className="font-semibold text-[#006c49]">
                        New: {conflictStats.newCount}
                      </span>
                      <span className="font-semibold text-[#7d4200]">
                        Duplicates: {conflictStats.duplicateCount}
                      </span>
                      {conflictStats.missingPhoneCount > 0 && (
                        <span className="text-[#3e4947]">
                          Missing Phone: {conflictStats.missingPhoneCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {conflictStats.duplicateCount > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-2.5 border border-[#eaedff]">
                      <div className="flex items-center gap-1.5 text-xs text-[#7d4200] font-medium">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {conflictStats.duplicateCount} matching EC No. or
                          Name+Batch found:
                        </span>
                      </div>
                      <div className="inline-flex rounded-lg bg-[#f2f3ff] p-0.5 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={() => setDuplicateStrategy('skip')}
                          className={`rounded-md px-2.5 py-1 transition-colors ${
                            duplicateStrategy === 'skip'
                              ? 'bg-white text-[#131b2e] shadow-2xs'
                              : 'text-[#3e4947]'
                          }`}
                        >
                          Skip Duplicates
                        </button>
                        <button
                          type="button"
                          onClick={() => setDuplicateStrategy('update')}
                          className={`rounded-md px-2.5 py-1 transition-colors ${
                            duplicateStrategy === 'update'
                              ? 'bg-white text-[#005c55] shadow-2xs'
                              : 'text-[#3e4947]'
                          }`}
                        >
                          Update Existing
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="max-h-40 overflow-y-auto rounded-xl border border-[#eaedff] bg-white">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-[#faf8ff] border-b border-[#f2f3ff] text-[#3e4947]">
                        <tr>
                          <th className="p-2">EC No.</th>
                          <th className="p-2">Student Name</th>
                          <th className="p-2 text-right">XI / XII Paid</th>
                          <th className="p-2">Match</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f2f3ff]">
                        {conflictRows.slice(0, 25).map((r, i) => (
                          <tr key={i}>
                            <td className="p-2 font-mono">{r.incoming.rollNo}</td>
                            <td className="p-2 font-medium text-[#131b2e]">
                              {r.incoming.fullName}
                            </td>
                            <td className="p-2 text-right font-mono">
                              {formatINR(r.incoming.paidClassXI)} /{' '}
                              {formatINR(r.incoming.paidClassXII)}
                            </td>
                            <td className="p-2 font-semibold">
                              {r.matchType === 'new' ? (
                                <span className="text-[#006c49]">New</span>
                              ) : r.matchType === 'duplicate_ec' ? (
                                <span className="text-[#7d4200]">
                                  Same EC No.
                                </span>
                              ) : (
                                <span className="text-[#7d4200]">
                                  Same Name
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="rounded-xl bg-[#ffdad6] px-3 py-2 text-xs font-medium text-[#ba1a1a]">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#f2f3ff]">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-[#f2f3ff] px-4 py-2 text-xs font-semibold text-[#131b2e]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || conflictRows.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0f766e] disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {submitting
                    ? 'Importing...'
                    : duplicateStrategy === 'skip'
                    ? `Import ${conflictStats.newCount} New`
                    : `Import / Update ${conflictRows.length}`}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
