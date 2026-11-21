import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Plus,
  Save,
  Upload,
  UserPlus,
} from 'lucide-react';
import {
  FeeStructureSettings,
  ImportConflictRow,
  StudentRecord,
} from '../types';
import {
  formatINR,
  getNextAcademicYear,
  reconcileImportedStudents,
} from '../utils/ledgerLogic';
import {
  downloadStudentImportExcelTemplate,
  parseStudentExcelFile,
} from '../utils/excelUtils';

interface MastersManagementPageProps {
  students: StudentRecord[];
  availableAYs: string[];
  feeSettings: FeeStructureSettings;
  activeMasterTab: 'BATCH_MASTER' | 'FEE_HEAD_MASTER' | 'EXCEL_IMPORT';
  onChangeMasterTab: (
    tab: 'BATCH_MASTER' | 'FEE_HEAD_MASTER' | 'EXCEL_IMPORT'
  ) => void;
  onAddBatchAY: (newAY: string) => void;
  onUpdateFeeSettings: (next: FeeStructureSettings) => void;
  onSelectBatchAndGoToCollect: (
    ay: string,
    classFilter?: 'ALL' | 'XI' | 'XII'
  ) => void;
  onOpenAddStudentForBatch: (batchAY: string) => void;
  onBulkImportStudents: (
    conflicts: ImportConflictRow[],
    duplicateStrategy: 'skip' | 'update'
  ) => Promise<void>;
  onExportBackupJSON: () => void;
  onRestoreBackupFile: (file: File) => void;
}

export const MastersManagementPage: React.FC<MastersManagementPageProps> = ({
  students,
  availableAYs,
  feeSettings,
  activeMasterTab,
  onChangeMasterTab,
  onAddBatchAY,
  onUpdateFeeSettings,
  onSelectBatchAndGoToCollect,
  onOpenAddStudentForBatch,
  onBulkImportStudents,
  onExportBackupJSON,
  onRestoreBackupFile,
}) => {
  const [newBatchInput, setNewBatchInput] = useState<string>('2029-30');
  const [importTargetBatch, setImportTargetBatch] = useState<string>('2026-27');
  const [parsedPreview, setParsedPreview] = useState<
    Omit<StudentRecord, 'createdAt' | 'updatedAt'>[]
  >([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update'>(
    'skip'
  );
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState<boolean>(false);

  // Editable Fee Head Master State
  const [schoolNameInput, setSchoolNameInput] = useState<string>(
    feeSettings.schoolDisplayName
  );
  const [xiDefaultFeeInput, setXiDefaultFeeInput] = useState<string>(
    String(feeSettings.classXIDefaultFee)
  );
  const [xiiDefaultFeeInput, setXiiDefaultFeeInput] = useState<string>(
    String(feeSettings.classXIIDefaultFee)
  );
  const [receiptPrefixInput, setReceiptPrefixInput] = useState<string>(
    feeSettings.receiptPrefix
  );

  const batchSummaries = useMemo(() => {
    const allEnrollmentBatches = Array.from(
      new Set([
        '2025-26',
        '2026-27',
        ...availableAYs,
        ...students.map((s) => s.enrollmentAY),
      ])
    )
      .filter((ay) => ay !== 'ALL_BATCHES')
      .sort();

    return allEnrollmentBatches.map((ay) => {
      const nextAY = getNextAcademicYear(ay);
      const batchStudents = students.filter((s) => s.enrollmentAY === ay);
      const xiCollected = batchStudents.reduce(
        (sum, s) => sum + s.paidClassXI,
        0
      );
      const xiiCollected = batchStudents.reduce(
        (sum, s) => sum + s.paidClassXII,
        0
      );
      const totalCollected = xiCollected + xiiCollected;

      return {
        enrollmentAY: ay,
        progressionAY: nextAY,
        studentCount: batchStudents.length,
        xiCollected,
        xiiCollected,
        totalCollected,
      };
    });
  }, [students, availableAYs]);

  const conflictRows = useMemo(
    () => reconcileImportedStudents(parsedPreview, students),
    [parsedPreview, students]
  );

  const conflictCounts = useMemo(() => {
    let newCount = 0;
    let duplicateCount = 0;
    let missingPhoneCount = 0;
    conflictRows.forEach((r) => {
      if (r.matchType === 'new') newCount += 1;
      else duplicateCount += 1;
      if (r.missingPhone) missingPhoneCount += 1;
    });
    return { newCount, duplicateCount, missingPhoneCount };
  }, [conflictRows]);

  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newBatchInput.trim();
    if (!/^\d{4}-\d{2,4}$/.test(cleaned)) return;
    onAddBatchAY(cleaned);
    setNewBatchInput('');
  };

  const handleSaveFeeStructure = (e: React.FormEvent) => {
    e.preventDefault();
    const xi = Math.max(0, Math.round(Number(xiDefaultFeeInput) || 0));
    const xii = Math.max(0, Math.round(Number(xiiDefaultFeeInput) || 0));
    const cleanPrefix =
      receiptPrefixInput
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase()
        .slice(0, 8) || 'SF';

    onUpdateFeeSettings({
      schoolDisplayName:
        schoolNameInput.trim() || 'SciFee — Integrated Science College',
      classXIDefaultFee: xi,
      classXIIDefaultFee: xii,
      receiptPrefix: cleanPrefix,
    });
  };

  const handleExcelFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rows = await parseStudentExcelFile(
        file,
        importTargetBatch,
        students.length + 1,
        feeSettings.classXIDefaultFee,
        feeSettings.classXIIDefaultFee
      );
      if (rows.length === 0) {
        setImportError(
          'No valid student rows found. Please check column headers (Student Name, Father Name, Class XI Paid, Class XII Paid).'
        );
        return;
      }
      setParsedPreview(rows);
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : 'Could not parse the uploaded Excel file.'
      );
    }
  };

  const handleConfirmExcelImport = async () => {
    if (conflictRows.length === 0) return;
    if (duplicateStrategy === 'skip' && conflictCounts.newCount === 0) {
      setImportError(
        'All uploaded rows already exist. Choose "Update Existing" if you want to overwrite matching students.'
      );
      return;
    }
    setImporting(true);
    try {
      await onBulkImportStudents(conflictRows, duplicateStrategy);
      setParsedPreview([]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#3e4947]">
            Bulk Operations · Templates &amp; Backup
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#131b2e]">
            Excel Import &amp; Backup
          </h1>
          <p className="text-sm text-[#3e4947] mt-0.5">
            Download Excel templates, run duplicate-safe bulk student imports,
            backup/restore workspace JSON, and configure batch years.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#f2f3ff] p-1">
          <button
            type="button"
            onClick={() => onChangeMasterTab('EXCEL_IMPORT')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeMasterTab === 'EXCEL_IMPORT'
                ? 'bg-white text-[#131b2e] shadow-2xs'
                : 'text-[#3e4947] hover:text-[#131b2e]'
            }`}
          >
            Excel Import &amp; Backup
          </button>
          <button
            type="button"
            onClick={() => onChangeMasterTab('BATCH_MASTER')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeMasterTab === 'BATCH_MASTER'
                ? 'bg-white text-[#131b2e] shadow-2xs'
                : 'text-[#3e4947] hover:text-[#131b2e]'
            }`}
          >
            Batch &amp; Year Master
          </button>
          <button
            type="button"
            onClick={() => onChangeMasterTab('FEE_HEAD_MASTER')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeMasterTab === 'FEE_HEAD_MASTER'
                ? 'bg-white text-[#131b2e] shadow-2xs'
                : 'text-[#3e4947] hover:text-[#131b2e]'
            }`}
          >
            Fee Head &amp; Receipt Settings
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(19,27,46,0.04)] space-y-6">
        {activeMasterTab === 'BATCH_MASTER' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f2f3ff] pb-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#131b2e]">
                  Academic Year &amp; Auto-Promotion Master
                </h2>
                <p className="text-xs text-[#3e4947]">
                  Class XI admission batches automatically promote into Class
                  XII the following year.
                </p>
              </div>

              <form
                onSubmit={handleCreateBatch}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={newBatchInput}
                  onChange={(e) => setNewBatchInput(e.target.value)}
                  placeholder="e.g. 2029-30"
                  className="w-28 rounded-xl bg-[#f2f3ff] px-3 py-1.5 font-mono text-xs font-semibold text-[#131b2e]"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0f766e]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Year
                </button>
              </form>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#f2f3ff]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-[#faf8ff] border-b border-[#f2f3ff] font-semibold text-[#3e4947]">
                    <th className="py-3 px-4">Batch</th>
                    <th className="py-3 px-3">Class XI Year</th>
                    <th className="py-3 px-3">Promoted Class XII Year</th>
                    <th className="py-3 px-3 text-right font-mono">Students</th>
                    <th className="py-3 px-3 text-right font-mono">XI Paid</th>
                    <th className="py-3 px-3 text-right font-mono">XII Paid</th>
                    <th className="py-3 px-3 text-right font-mono">Total</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f3ff] text-[#3e4947]">
                  {batchSummaries.map((b) => (
                    <tr key={b.enrollmentAY} className="hover:bg-[#faf8ff]">
                      <td className="py-3.5 px-4 font-bold text-[#131b2e] font-mono">
                        {b.enrollmentAY}
                      </td>
                      <td className="py-3.5 px-3 font-mono">
                        {b.enrollmentAY} (XI)
                      </td>
                      <td className="py-3.5 px-3 font-mono text-[#005c55] font-semibold">
                        {b.progressionAY} (XII)
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-[#131b2e] tabular-nums">
                        {b.studentCount}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-[#006c49] font-semibold tabular-nums">
                        {formatINR(b.xiCollected)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-[#005c55] font-semibold tabular-nums">
                        {formatINR(b.xiiCollected)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-[#131b2e] tabular-nums">
                        {formatINR(b.totalCollected)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onSelectBatchAndGoToCollect(b.enrollmentAY, 'XI')
                            }
                            className="rounded-xl bg-[#f2f3ff] px-2.5 py-1.5 text-[11px] font-semibold text-[#131b2e] hover:bg-[#e2e7ff]"
                          >
                            View XI
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onSelectBatchAndGoToCollect(
                                b.progressionAY,
                                'XII'
                              )
                            }
                            className="rounded-xl bg-[#005c55] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0f766e]"
                          >
                            View XII
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenAddStudentForBatch(b.enrollmentAY)
                            }
                            className="inline-flex items-center gap-1 rounded-xl bg-[#f2f3ff] px-2.5 py-1.5 text-[11px] font-semibold text-[#005c55] hover:bg-[#e2e7ff]"
                          >
                            <UserPlus className="h-3 w-3" />
                            Add
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeMasterTab === 'FEE_HEAD_MASTER' && (
          <form onSubmit={handleSaveFeeStructure} className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f2f3ff] pb-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#131b2e]">
                  Default Fee Structure &amp; Receipt Branding
                </h2>
                <p className="text-xs text-[#3e4947]">
                  Applies to new student admissions, Excel templates, and
                  official two-copy printed receipts. Existing students keep
                  their current ledger fees unless edited individually.
                </p>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e]"
              >
                <Save className="h-3.5 w-3.5" />
                Save Defaults
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
                  School / Institution Display Name (on Receipts)
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={schoolNameInput}
                  onChange={(e) => setSchoolNameInput(e.target.value)}
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 text-xs font-medium text-[#131b2e]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
                  Default Class XI Fee (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={xiDefaultFeeInput}
                  onChange={(e) => setXiDefaultFeeInput(e.target.value)}
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs font-bold text-[#131b2e]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#131b2e] mb-1.5">
                  Default Class XII Fee (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={xiiDefaultFeeInput}
                  onChange={(e) => setXiiDefaultFeeInput(e.target.value)}
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-2 font-mono text-xs font-bold text-[#131b2e]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-2xl bg-[#faf8ff] border border-[#eaedff] p-4">
              <div>
                <label className="block text-xs font-semibold text-[#131b2e] mb-1">
                  Receipt Series Prefix
                </label>
                <input
                  type="text"
                  maxLength={8}
                  value={receiptPrefixInput}
                  onChange={(e) => setReceiptPrefixInput(e.target.value)}
                  className="w-full rounded-xl border border-[#bdc9c6] bg-white px-3 py-1.5 font-mono text-xs font-bold uppercase text-[#131b2e]"
                />
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#3e4947]">
                  Sequential Receipt Format Preview
                </div>
                <div className="mt-1.5 font-mono text-sm font-bold text-[#005c55]">
                  {(receiptPrefixInput.trim().replace(/[^a-zA-Z0-9]/g, '') || 'SF').toUpperCase()}
                  /2026-27/0001
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#3e4947]">
                  2-Year Integrated Package Default
                </div>
                <div className="mt-1.5 font-mono text-sm font-bold text-[#131b2e]">
                  {formatINR(
                    (Number(xiDefaultFeeInput) || 0) +
                      (Number(xiiDefaultFeeInput) || 0)
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#f2f3ff]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-[#faf8ff] border-b border-[#f2f3ff] font-semibold text-[#3e4947]">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-3">Fee Head Particular</th>
                    <th className="py-3 px-3">Applicable Class</th>
                    <th className="py-3 px-3 text-right font-mono">
                      Standard Fee
                    </th>
                    <th className="py-3 px-4">Cross-Year Sync Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f3ff] text-[#3e4947]">
                  <tr>
                    <td className="py-3.5 px-4 font-mono font-bold text-[#131b2e]">
                      INT-TERM-01
                    </td>
                    <td className="py-3.5 px-3 font-semibold text-[#131b2e]">
                      Fees In Term - I (Class XI Integrated)
                    </td>
                    <td className="py-3.5 px-3">Class XI (Admission Year)</td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-[#131b2e]">
                      {formatINR(Number(xiDefaultFeeInput) || 0)}
                    </td>
                    <td className="py-3.5 px-4 text-[#006c49] font-medium">
                      Carries forward to Class XII ledger automatically
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-4 font-mono font-bold text-[#131b2e]">
                      INT-TERM-02
                    </td>
                    <td className="py-3.5 px-3 font-semibold text-[#131b2e]">
                      Fees In Term - II (Class XII Integrated)
                    </td>
                    <td className="py-3.5 px-3">Class XII (Next Session)</td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-[#131b2e]">
                      {formatINR(Number(xiiDefaultFeeInput) || 0)}
                    </td>
                    <td className="py-3.5 px-4 text-[#006c49] font-medium">
                      Payable in advance in XI or on promotion to XII
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </form>
        )}

        {activeMasterTab === 'EXCEL_IMPORT' && (
          <div className="space-y-6">
            {/* Duplicate-Safe Excel Import */}
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f2f3ff] pb-4">
                <div>
                  <h2 className="font-display text-base font-bold text-[#131b2e]">
                    Duplicate-Safe Bulk Excel Import (.xlsx / .csv)
                  </h2>
                  <p className="text-xs text-[#3e4947]">
                    Automatically checks EC No. &amp; Name+Batch against
                    existing students so re-uploading a sheet never creates
                    duplicates.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    downloadStudentImportExcelTemplate(
                      importTargetBatch,
                      feeSettings.classXIDefaultFee,
                      feeSettings.classXIIDefaultFee
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#f2f3ff] px-4 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff]"
                >
                  <Download className="h-3.5 w-3.5 text-[#005c55]" />
                  Download Sample Template (.xlsx)
                </button>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="rounded-2xl bg-[#faf8ff] p-4 space-y-3">
                  <div className="text-xs font-bold text-[#131b2e]">
                    Step 1: Select Admission Year
                  </div>
                  <select
                    value={importTargetBatch}
                    onChange={(e) => setImportTargetBatch(e.target.value)}
                    className="w-full rounded-xl bg-white border border-[#bdc9c6] px-3 py-2 font-mono text-xs font-bold text-[#131b2e]"
                  >
                    {Array.from(
                      new Set(['2025-26', '2026-27', '2027-28', ...availableAYs])
                    )
                      .filter((a) => a !== 'ALL_BATCHES')
                      .sort()
                      .map((ay) => (
                        <option key={ay} value={ay}>
                          {ay}
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-[#3e4947]">
                    Students imported into <strong>{importTargetBatch}</strong>{' '}
                    auto-promote to Class XII in{' '}
                    {getNextAcademicYear(importTargetBatch)}.
                  </p>
                </div>

                <div className="lg:col-span-2 rounded-2xl border-2 border-dashed border-[#005c55]/30 bg-[#faf8ff] p-6 flex flex-col items-center justify-center text-center space-y-3">
                  <FileSpreadsheet className="h-8 w-8 text-[#005c55]" />
                  <div>
                    <div className="text-sm font-bold text-[#131b2e]">
                      Choose Excel File (.xlsx, .xls, or .csv)
                    </div>
                    <p className="text-xs text-[#3e4947] mt-0.5">
                      Preserves custom EC / Roll numbers verbatim and flags
                      missing mobile numbers instead of inventing fake ones.
                    </p>
                  </div>
                  <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-[#005c55] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0f766e]">
                    <Upload className="h-3.5 w-3.5" />
                    Select File
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleExcelFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {importError && (
                <div className="rounded-xl bg-[#ffdad6] p-3 text-xs font-medium text-[#ba1a1a]">
                  {importError}
                </div>
              )}

              {conflictRows.length > 0 && (
                <div className="space-y-4 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#faf8ff] border border-[#eaedff] p-4">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-[#131b2e]">
                        Conflict Preview: {conflictRows.length} rows scanned
                      </div>
                      <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                        <span className="font-semibold text-[#006c49]">
                          New: {conflictCounts.newCount}
                        </span>
                        <span className="font-semibold text-[#7d4200]">
                          Duplicates: {conflictCounts.duplicateCount}
                        </span>
                        <span className="text-[#3e4947]">
                          Missing Phone: {conflictCounts.missingPhoneCount}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {conflictCounts.duplicateCount > 0 && (
                        <div className="inline-flex rounded-xl bg-[#f2f3ff] p-1 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => setDuplicateStrategy('skip')}
                            className={`rounded-lg px-3 py-1 transition-colors ${
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
                            className={`rounded-lg px-3 py-1 transition-colors ${
                              duplicateStrategy === 'update'
                                ? 'bg-white text-[#005c55] shadow-2xs'
                                : 'text-[#3e4947]'
                            }`}
                          >
                            Update Existing
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setParsedPreview([])}
                        className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-xs font-semibold text-[#131b2e]"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        disabled={importing}
                        onClick={handleConfirmExcelImport}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#006c49] px-5 py-2 text-xs font-bold text-white hover:bg-[#005c55]"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {importing
                          ? 'Importing...'
                          : duplicateStrategy === 'skip'
                          ? `Import ${conflictCounts.newCount} New`
                          : `Import / Update ${conflictRows.length}`}
                      </button>
                    </div>
                  </div>

                  {conflictCounts.duplicateCount > 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-[#ffdcc3]/50 px-4 py-2.5 text-xs text-[#7d4200]">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        {conflictCounts.duplicateCount} rows match existing
                        students by EC No. or Name+Batch. Currently set to{' '}
                        <strong>
                          {duplicateStrategy === 'skip'
                            ? 'Skip Duplicates'
                            : 'Update Existing Records'}
                        </strong>
                        .
                      </span>
                    </div>
                  )}

                  <div className="max-h-72 overflow-y-auto rounded-xl border border-[#f2f3ff]">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="bg-[#faf8ff] sticky top-0">
                        <tr className="border-b border-[#f2f3ff] text-[#3e4947]">
                          <th className="p-2.5">EC No.</th>
                          <th className="p-2.5">Student Name</th>
                          <th className="p-2.5">Batch</th>
                          <th className="p-2.5 text-right">XI Paid</th>
                          <th className="p-2.5 text-right">XII Paid</th>
                          <th className="p-2.5">Import Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f2f3ff]">
                        {conflictRows.map((row, i) => (
                          <tr key={i}>
                            <td className="p-2.5 font-mono">
                              {row.incoming.rollNo}
                            </td>
                            <td className="p-2.5 font-semibold text-[#131b2e]">
                              {row.incoming.fullName}
                              {row.missingPhone && (
                                <span className="ml-2 text-[10px] font-medium text-[#7d4200]">
                                  (Phone missing)
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 font-mono">
                              {row.incoming.enrollmentAY} →{' '}
                              {row.incoming.progressionAY}
                            </td>
                            <td className="p-2.5 text-right font-mono">
                              {formatINR(row.incoming.paidClassXI)}
                            </td>
                            <td className="p-2.5 text-right font-mono">
                              {formatINR(row.incoming.paidClassXII)}
                            </td>
                            <td className="p-2.5 font-semibold">
                              {row.matchType === 'new' ? (
                                <span className="text-[#006c49]">New</span>
                              ) : duplicateStrategy === 'skip' ? (
                                <span className="text-[#3e4947]">
                                  Will Skip (
                                  {row.matchType === 'duplicate_ec'
                                    ? 'Same EC'
                                    : 'Same Name'}
                                  )
                                </span>
                              ) : (
                                <span className="text-[#7d4200]">
                                  Will Update Existing
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
            </div>

            {/* Full Workspace JSON Backup & Restore Card */}
            <div className="border-t border-[#f2f3ff] pt-6">
              <div className="rounded-2xl bg-[#faf8ff] border border-[#eaedff] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white shadow-2xs flex items-center justify-center text-[#005c55] shrink-0">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-[#131b2e]">
                      Full Workspace Backup &amp; Restore (.json)
                    </h3>
                    <p className="text-xs text-[#3e4947] mt-0.5 max-w-xl">
                      Download a complete dated snapshot of all{' '}
                      <strong>{students.length} students</strong>, active &amp;
                      reversed receipts, academic years, and fee settings. Keep
                      a weekly copy on Google Drive or USB.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onExportBackupJSON}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download JSON Backup
                  </button>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-[#131b2e] shadow-2xs hover:bg-[#f2f3ff]">
                    <Upload className="h-3.5 w-3.5 text-[#005c55]" />
                    Restore from Backup
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onRestoreBackupFile(f);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
