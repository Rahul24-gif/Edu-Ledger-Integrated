import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  CheckSquare,
  Download,
  Edit3,
  FileSpreadsheet,
  IndianRupee,
  Plus,
  Search,
  Square,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import {
  ClassLevel,
  HeaderConfig,
  PaymentRecord,
  REGISTER_STATUS_CATEGORIES,
  RegisterStatusCategory,
  StudentInAcademicYearView,
  StudentRecord,
} from '../types';
import {
  formatINR,
  getBatchHeadForAY,
  getClassHeadDisplayName,
  getNextAcademicYear,
  getStatusDisplayLabel,
  getYear2AdvancePaymentInfo,
  isClassXIIDueInAY,
  isPlaceholderPhone,
} from '../utils/ledgerLogic';
import {
  downloadStudentImportExcelTemplate,
  exportCollectFeeToExcel,
} from '../utils/excelUtils';

type SortKey =
  | 'rollNo'
  | 'fullName'
  | 'enrollmentAY'
  | 'paidClassXI'
  | 'paidClassXII'
  | 'pending';

interface FeeCollectionTableProps {
  mode: 'collect_fee' | 'students_master';
  selectedAY: string;
  availableAYs: string[];
  headerConfig: HeaderConfig;
  payments: PaymentRecord[];
  studentsInSelectedAY: StudentInAcademicYearView[];
  classTab: 'ALL' | ClassLevel | 'PENDING';
  onChangeClassTab: (tab: 'ALL' | ClassLevel | 'PENDING') => void;
  batchFilter: string;
  onChangeBatchFilter: (batch: string) => void;
  remarkFilter: 'ALL' | RegisterStatusCategory;
  onChangeRemarkFilter: (remark: 'ALL' | RegisterStatusCategory) => void;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  onOpenStudentLedger: (studentId: string) => void;
  onOpenQuickCollect: (student: StudentRecord) => void;
  onEditStudent: (student: StudentRecord) => void;
  onRequestDeleteStudent: (student: StudentRecord) => void;
  onOpenCreateStudent: (tab: 'single' | 'bulk') => void;
  onExportBackupJSON?: () => void;
  onRestoreBackupFile?: (file: File) => void;
}

const isPendingDueRow = (row: StudentInAcademicYearView) =>
  row.registerCategory === 'XII Pending' ||
  row.registerCategory === 'XII Will Pay June 26' ||
  row.registerCategory === 'Partial Paid (₹5k Due)' ||
  row.registerCategory === 'Fee Pending';

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ST';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const FeeCollectionTable: React.FC<FeeCollectionTableProps> = ({
  mode,
  selectedAY,
  availableAYs,
  headerConfig,
  payments,
  studentsInSelectedAY,
  classTab,
  onChangeClassTab,
  batchFilter,
  onChangeBatchFilter,
  remarkFilter,
  onChangeRemarkFilter,
  searchQuery,
  onChangeSearchQuery,
  onOpenStudentLedger,
  onEditStudent,
  onRequestDeleteStudent,
  onOpenCreateStudent,
  onExportBackupJSON,
  onRestoreBackupFile,
}) => {
  const [entriesPerPage, setEntriesPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortKey, setSortKey] = useState<SortKey>('rollNo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const showSelection = false;

  const classXICount = useMemo(
    () =>
      studentsInSelectedAY.filter((s) => s.activeClassInSelectedAY === 'XI')
        .length,
    [studentsInSelectedAY]
  );

  const classXIICount = useMemo(
    () =>
      studentsInSelectedAY.filter((s) => s.activeClassInSelectedAY === 'XII')
        .length,
    [studentsInSelectedAY]
  );

  const promotedCount = useMemo(
    () =>
      studentsInSelectedAY.filter((s) => s.isPromotedFromPreviousAY).length,
    [studentsInSelectedAY]
  );

  const cohortStats = useMemo(() => {
    let totalPaid = 0;
    let totalPayable = 0;
    let totalPending = 0;
    let pendingCount = 0;

    studentsInSelectedAY.forEach((r) => {
      totalPaid += r.student.totalPaid;
      totalPayable += r.student.totalIntegratedFee;
      totalPending += r.totalPendingIntegrated;
      if (isPendingDueRow(r)) {
        pendingCount += 1;
      }
    });

    const pct =
      totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;

    return { totalPaid, totalPayable, totalPending, pendingCount, pct };
  }, [studentsInSelectedAY]);

  // Filtered + Sorted rows
  const filteredAndSortedRows = useMemo(() => {
    const filtered = studentsInSelectedAY.filter((row) => {
      if (classTab === 'PENDING') {
        if (!isPendingDueRow(row)) return false;
      } else if (
        classTab !== 'ALL' &&
        row.activeClassInSelectedAY !== classTab
      ) {
        return false;
      }
      if (batchFilter !== 'ALL' && row.student.enrollmentAY !== batchFilter) {
        return false;
      }
      if (remarkFilter !== 'ALL' && row.registerCategory !== remarkFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = row.student.fullName.toLowerCase().includes(q);
        const matchEc = row.student.rollNo.toLowerCase().includes(q);
        const matchFather = (row.student.fatherName || '')
          .toLowerCase()
          .includes(q);
        const matchPhone = (row.student.phone || '').toLowerCase().includes(q);
        const matchBatch = row.student.centerName.toLowerCase().includes(q);
        const matchRemark = row.registerCategory.toLowerCase().includes(q);
        if (
          !matchName &&
          !matchEc &&
          !matchFather &&
          !matchPhone &&
          !matchBatch &&
          !matchRemark
        ) {
          return false;
        }
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'rollNo':
          cmp = a.student.rollNo.localeCompare(b.student.rollNo);
          break;
        case 'fullName':
          cmp = a.student.fullName.localeCompare(b.student.fullName);
          break;
        case 'enrollmentAY':
          cmp = a.student.enrollmentAY.localeCompare(b.student.enrollmentAY);
          break;
        case 'paidClassXI':
          cmp = a.student.paidClassXI - b.student.paidClassXI;
          break;
        case 'paidClassXII':
          cmp = a.student.paidClassXII - b.student.paidClassXII;
          break;
        case 'pending':
          cmp = a.totalPendingIntegrated - b.totalPendingIntegrated;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [
    studentsInSelectedAY,
    classTab,
    batchFilter,
    remarkFilter,
    searchQuery,
    sortKey,
    sortDir,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSortedRows.length / entriesPerPage)
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIdx = (safeCurrentPage - 1) * entriesPerPage;

  const paginatedRows = useMemo(
    () => filteredAndSortedRows.slice(startIdx, startIdx + entriesPerPage),
    [filteredAndSortedRows, startIdx, entriesPerPage]
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'pending' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3 w-3 text-[#bdc9c6]" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-[#005c55]" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[#005c55]" />
    );
  };

  const allPageSelected =
    paginatedRows.length > 0 &&
    paginatedRows.every((r) => selectedIds.includes(r.student.studentId));

  const toggleSelectAllOnPage = () => {
    const pageIds = paginatedRows.map((r) => r.student.studentId);
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleRowSelection = (studentId: string) => {
    setSelectedIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const selectedRowsForExport = useMemo(
    () =>
      filteredAndSortedRows.filter((r) =>
        selectedIds.includes(r.student.studentId)
      ),
    [filteredAndSortedRows, selectedIds]
  );

  const hasActiveFilters =
    classTab !== 'ALL' ||
    batchFilter !== 'ALL' ||
    remarkFilter !== 'ALL' ||
    searchQuery.trim().length > 0;

  const clearAllFilters = () => {
    onChangeClassTab('ALL');
    onChangeBatchFilter('ALL');
    onChangeRemarkFilter('ALL');
    onChangeSearchQuery('');
    setCurrentPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* HEADER & PRIMARY ACTIONS */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#3e4947]">
            {mode === 'students_master'
              ? `Cohort ${selectedAY} · 2-Year Integrated Science`
              : `Live Ledger · Session ${selectedAY}`}
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#131b2e]">
            {mode === 'students_master' ? 'Students' : 'Fee Collection'}
          </h1>
          <p className="mt-1 text-sm text-[#3e4947]">
            {mode === 'students_master'
              ? `View and manage all ${studentsInSelectedAY.length} registered students in Session ${selectedAY}.`
              : `Record Class XI & Class XII integrated fee payments with automatic cross-year sync.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {mode === 'students_master' ? (
            <button
              type="button"
              onClick={() => onOpenCreateStudent('single')}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#005c55] text-white shadow-xs hover:bg-[#0f766e] transition-colors text-xs font-semibold whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add Student</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* STUDENTS MODE ONLY: ROLLOVER STATUS BANNER (Fee Collection intentionally keeps zero KPI cards) */}
      {mode === 'students_master' && (
        <div className="rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(19,27,46,0.04)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-[#e6f7ef] flex items-center justify-center text-[#006c49] shrink-0 mt-0.5">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-sm font-bold text-[#131b2e]">
                  Academic Year {selectedAY} Rollover Active
                </h2>
                <span className="text-xs font-medium text-[#006c49]">
                  · Auto-Synced
                </span>
              </div>
              <p className="mt-1 text-xs text-[#3e4947] leading-relaxed">
                <strong className="text-[#131b2e] font-semibold">
                  {promotedCount} Class XII students
                </strong>{' '}
                rolled over with their Class XI payment ledgers intact.{' '}
                <strong className="text-[#131b2e] font-semibold">
                  {classXICount} Class XI students
                </strong>{' '}
                active in {selectedAY} and linked to Class XII (
                {getNextAcademicYear(selectedAY)}).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5 shrink-0 self-end md:self-center">
            <div className="text-right">
              <div className="text-[11px] font-medium text-[#3e4947]">
                Collection Progress
              </div>
              <div className="font-mono text-lg font-bold text-[#006c49] tabular-nums">
                {cohortStats.pct}%
              </div>
            </div>
            <div className="w-28">
              <div className="h-2 w-full rounded-full bg-[#eaedff] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#006c49]"
                  style={{ width: `${Math.min(100, cohortStats.pct)}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] font-mono text-[#3e4947] text-right tabular-nums">
                {formatINR(cohortStats.totalPaid)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CALM LEDGER TABLE CARD */}
      <div className="rounded-2xl bg-white shadow-[0_1px_8px_rgba(19,27,46,0.04)] overflow-hidden">
        {/* Filter Toolbar */}
        <div className="p-4 sm:px-5 border-b border-[#f2f3ff] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* 4 Segmented Filter Tabs (All, Class XI, Class XII, Pending Only) */}
            <div
              role="tablist"
              aria-label="Filter by class or pending status"
              className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-[#f2f3ff] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={classTab === 'ALL'}
                onClick={() => {
                  onChangeClassTab('ALL');
                  setCurrentPage(1);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  classTab === 'ALL'
                    ? 'bg-white text-[#131b2e] shadow-2xs'
                    : 'text-[#3e4947] hover:text-[#131b2e]'
                }`}
              >
                All ({studentsInSelectedAY.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={classTab === 'XI'}
                onClick={() => {
                  onChangeClassTab('XI');
                  setCurrentPage(1);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  classTab === 'XI'
                    ? 'bg-white text-[#005c55] shadow-2xs'
                    : 'text-[#3e4947] hover:text-[#131b2e]'
                }`}
              >
                Class XI ({classXICount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={classTab === 'XII'}
                onClick={() => {
                  onChangeClassTab('XII');
                  setCurrentPage(1);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  classTab === 'XII'
                    ? 'bg-white text-[#005c55] shadow-2xs'
                    : 'text-[#3e4947] hover:text-[#131b2e]'
                }`}
              >
                Class XII ({classXIICount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={classTab === 'PENDING'}
                onClick={() => {
                  onChangeClassTab('PENDING');
                  setCurrentPage(1);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  classTab === 'PENDING'
                    ? 'bg-[#ffdcc3] text-[#7d4200] shadow-2xs'
                    : 'text-[#7d4200] hover:bg-[#ffdcc3]/40'
                }`}
              >
                Pending Only ({cohortStats.pendingCount})
              </button>
            </div>

            {/* Table Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#3e4947]" />
              <input
                type="text"
                aria-label="Search students in table"
                value={searchQuery}
                onChange={(e) => {
                  onChangeSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search student name, EC No, or phone..."
                className="w-full h-9 rounded-xl bg-[#f2f3ff] pl-9 pr-8 text-xs text-[#131b2e] placeholder:text-[#3e4947]/80 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#005c55] transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => onChangeSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3e4947] hover:text-[#131b2e]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Secondary Filter Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-[#3e4947]">
                <label htmlFor="entries-per-page">Rows</label>
                <select
                  id="entries-per-page"
                  value={entriesPerPage}
                  onChange={(e) => {
                    setEntriesPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-xl bg-[#f2f3ff] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#131b2e] focus:outline-none"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>All</option>
                </select>
              </div>

              <select
                aria-label="Filter by Admission Batch"
                value={batchFilter}
                onChange={(e) => {
                  onChangeBatchFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-xs font-medium text-[#131b2e] focus:outline-none"
              >
                <option value="ALL">All Admission Batches</option>
                {availableAYs.map((ay) => (
                  <option key={ay} value={ay}>
                    {getBatchHeadForAY(headerConfig, ay).batchTitle}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by Fee Status"
                value={remarkFilter}
                onChange={(e) => {
                  onChangeRemarkFilter(
                    e.target.value as 'ALL' | RegisterStatusCategory
                  );
                  setCurrentPage(1);
                }}
                className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-xs font-medium text-[#131b2e] focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                {REGISTER_STATUS_CATEGORIES.map((c) => (
                  <option key={c.category} value={c.category}>
                    {getStatusDisplayLabel(headerConfig, c.category)}
                  </option>
                ))}
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-[#005c55] hover:bg-[#f2f3ff] transition-colors"
                >
                  <X className="h-3 w-3" />
                  Reset
                </button>
              )}
            </div>

            {showSelection && selectedIds.length > 0 ? (
              <div className="flex items-center gap-2.5 rounded-xl bg-[#e6f7ef] px-3 py-1.5 text-xs">
                <span className="font-mono font-bold text-[#005c55]">
                  {selectedIds.length} selected
                </span>
                <button
                  type="button"
                  onClick={() =>
                    exportCollectFeeToExcel(selectedRowsForExport, selectedAY, {
                      headerConfig,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-[#005c55] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#0f766e] transition-colors"
                >
                  <FileSpreadsheet className="h-3 w-3" />
                  Export Selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-[#3e4947] hover:text-[#131b2e] text-[11px] font-medium"
                >
                  Clear
                </button>
              </div>
            ) : (
              <span className="text-xs text-[#3e4947] font-mono tabular-nums">
                {filteredAndSortedRows.length} students
              </span>
            )}
          </div>
        </div>

        {/* CLEAN CALM LEDGER DATA TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#f2f3ff] bg-[#faf8ff] text-[11px] font-semibold text-[#3e4947]">
                {showSelection && (
                  <th className="py-3.5 pl-5 pr-2 w-10">
                    <button
                      type="button"
                      aria-label={
                        allPageSelected
                          ? 'Deselect all visible rows'
                          : 'Select all visible rows'
                      }
                      onClick={toggleSelectAllOnPage}
                      className="text-[#3e4947] hover:text-[#005c55] flex items-center"
                    >
                      {allPageSelected ? (
                        <CheckSquare className="h-4 w-4 text-[#005c55]" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                )}
                <th
                  className={`py-3.5 whitespace-nowrap ${
                    showSelection ? 'px-3' : 'pl-5 pr-3'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort('fullName')}
                    className="inline-flex items-center gap-1 hover:text-[#131b2e]"
                  >
                    Student &amp; EC No.
                    {renderSortIcon('fullName')}
                  </button>
                </th>
                <th className="py-3.5 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('enrollmentAY')}
                    className="inline-flex items-center gap-1 hover:text-[#131b2e]"
                  >
                    Class &amp; Batch
                    {renderSortIcon('enrollmentAY')}
                  </button>
                </th>
                <th className="py-3.5 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('paidClassXI')}
                    className="inline-flex items-center gap-1 hover:text-[#131b2e]"
                  >
                    {headerConfig.year1ShortLabel}
                    {renderSortIcon('paidClassXI')}
                  </button>
                </th>
                <th className="py-3.5 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('paidClassXII')}
                    className="inline-flex items-center gap-1 hover:text-[#131b2e]"
                  >
                    {headerConfig.year2ShortLabel}
                    {renderSortIcon('paidClassXII')}
                  </button>
                </th>
                <th className="py-3.5 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('pending')}
                    className="inline-flex items-center gap-1 hover:text-[#131b2e]"
                  >
                    2-Year Status
                    {renderSortIcon('pending')}
                  </button>
                </th>
                <th className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f3ff] text-[#3e4947]">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={showSelection ? 7 : 6}
                    className="py-12 text-center"
                  >
                    <p className="text-sm font-semibold text-[#131b2e]">
                      No matching students in {selectedAY}
                    </p>
                    <p className="mt-1 text-xs text-[#3e4947]">
                      Try clearing your filters or add a new student to this
                      session.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearAllFilters}
                          className="rounded-xl bg-[#f2f3ff] px-3.5 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff]"
                        >
                          Reset Filters
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenCreateStudent('single')}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#005c55] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0f766e]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Student
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const st = row.student;
                  const isSelected =
                    showSelection && selectedIds.includes(st.studentId);
                  const pctPaid =
                    st.totalIntegratedFee > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (st.totalPaid / st.totalIntegratedFee) * 100
                          )
                        )
                      : 100;

                  return (
                    <tr
                      key={st.studentId}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-[#f2f3ff]/80'
                          : 'hover:bg-[#faf8ff]'
                      }`}
                    >
                      {/* Checkbox (Students & Excel directory only) */}
                      {showSelection && (
                        <td className="py-3.5 pl-5 pr-2">
                          <button
                            type="button"
                            aria-label={`Select ${st.fullName}`}
                            onClick={() => toggleRowSelection(st.studentId)}
                            className="text-[#3e4947] hover:text-[#005c55] flex items-center"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-[#005c55]" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      )}

                      {/* Student Avatar + Name + EC No */}
                      <td
                        className={`py-3.5 min-w-[230px] ${
                          showSelection ? 'px-3' : 'pl-5 pr-3'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-[#f2f3ff] text-[#005c55] font-display font-bold text-[11px] flex items-center justify-center shrink-0">
                            {getInitials(st.fullName)}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onOpenStudentLedger(st.studentId)}
                              className="font-semibold text-[#131b2e] hover:text-[#005c55] hover:underline text-left block truncate max-w-[240px]"
                            >
                              {st.fullName}
                            </button>
                            <div className="mt-0.5 text-[11px] text-[#3e4947] flex items-center gap-1.5">
                              <span className="font-mono font-medium">
                                {st.rollNo}
                              </span>
                              <span aria-hidden="true">·</span>
                              {isPlaceholderPhone(st.phone) ? (
                                <button
                                  type="button"
                                  onClick={() => onEditStudent(st)}
                                  className="text-[#7d4200] hover:underline font-medium"
                                  title="Click to enter real parent mobile number"
                                >
                                  Phone missing
                                </button>
                              ) : (
                                <span className="font-mono">{st.phone}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Class & Batch (Driven by Centralized Headers) */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="font-semibold text-[#131b2e]">
                          {getClassHeadDisplayName(
                            headerConfig,
                            st.enrollmentAY,
                            row.activeClassInSelectedAY
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#3e4947]">
                          {row.isPromotedFromPreviousAY ? (
                            <span className="text-[#005c55] font-medium">
                              Promoted from {st.enrollmentAY} XI
                            </span>
                          ) : (
                            <span className="font-mono">
                              XI:{st.enrollmentAY} → XII:{st.progressionAY}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 1st Year (Class XI) Fee */}
                      <td className="py-3.5 px-3 whitespace-nowrap font-mono">
                        {row.netClassXIFee === 0 ? (
                          <span className="text-[#3e4947]">Direct XII</span>
                        ) : st.paidClassXI >= row.netClassXIFee ? (
                          <div>
                            <span className="font-semibold text-[#006c49]">
                              {formatINR(st.paidClassXI)}
                            </span>
                            <div className="text-[11px] text-[#3e4947]">
                              {st.xiPaymentDate || 'Paid'}
                            </div>
                          </div>
                        ) : st.paidClassXI > 0 ? (
                          <div>
                            <span className="font-semibold text-[#7d4200]">
                              {formatINR(st.paidClassXI)}
                            </span>
                            <div className="text-[11px] text-[#7d4200]">
                              {formatINR(row.netClassXIFee - st.paidClassXI)} due
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="font-semibold text-[#ba1a1a]">
                              ₹0
                            </span>
                            <div className="text-[11px] text-[#ba1a1a]">
                              Pending
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 2nd Year (Class XII) Fee */}
                      <td className="py-3.5 px-3 whitespace-nowrap font-mono">
                        {(() => {
                          const advInfo = getYear2AdvancePaymentInfo(
                            st,
                            payments
                          );
                          if (row.netClassXIIFee === 0) {
                            return (
                              <span className="text-[#3e4947]">Cancelled</span>
                            );
                          }
                          if (st.paidClassXII >= row.netClassXIIFee) {
                            return (
                              <div>
                                <span className="font-semibold text-[#006c49]">
                                  {formatINR(st.paidClassXII)}
                                </span>
                                <div className="text-[11px] text-[#006c49] font-sans font-medium">
                                  {advInfo.paidInAdvance && advInfo.paidInAY
                                    ? `Paid (Adv. ${advInfo.paidInAY})`
                                    : st.xiiPaymentDate || 'Paid'}
                                </div>
                              </div>
                            );
                          }
                          if (st.paidClassXII > 0) {
                            return (
                              <div>
                                <span className="font-semibold text-[#7d4200]">
                                  {formatINR(st.paidClassXII)}
                                </span>
                                <div className="text-[11px] text-[#7d4200]">
                                  {formatINR(
                                    row.netClassXIIFee - st.paidClassXII
                                  )}{' '}
                                  due
                                </div>
                              </div>
                            );
                          }
                          if (isClassXIIDueInAY(st, selectedAY)) {
                            return (
                              <div>
                                <span className="font-semibold text-[#7d4200]">
                                  {formatINR(st.paidClassXII)}
                                </span>
                                <div className="text-[11px] text-[#7d4200]">
                                  {st.remarks === 'XII Will Pay June 26'
                                    ? 'June 26'
                                    : `${formatINR(
                                        row.netClassXIIFee - st.paidClassXII
                                      )} due`}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div>
                              <span className="text-[#3e4947]">Upcoming</span>
                              <div className="text-[11px] text-[#3e4947]">
                                {st.progressionAY}
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      {/* 2-Year Progress */}
                      <td className="py-3.5 px-3 min-w-[150px]">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span
                            className={`font-semibold ${
                              row.registerCategory === 'Full Paid' ||
                              row.registerCategory === 'Direct XII Paid'
                                ? 'text-[#006c49]'
                                : row.registerCategory === 'Only XI Paid'
                                ? 'text-[#005c55]'
                                : row.registerCategory === 'Admission Cancelled'
                                ? 'text-[#3e4947]'
                                : 'text-[#7d4200]'
                            }`}
                          >
                            {getStatusDisplayLabel(
                              headerConfig,
                              row.registerCategory
                            )}
                          </span>
                          <span className="font-mono text-[#3e4947] tabular-nums">
                            {pctPaid}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eaedff]">
                          <div
                            className={`h-full rounded-full ${
                              pctPaid >= 100
                                ? 'bg-[#006c49]'
                                : pctPaid >= 50
                                ? 'bg-[#005c55]'
                                : 'bg-[#7d4200]'
                            }`}
                            style={{ width: `${Math.max(4, pctPaid)}%` }}
                          />
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">
                        {mode === 'students_master' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenStudentLedger(st.studentId)}
                              aria-label={`Open fee ledger for ${st.fullName}`}
                              className="inline-flex items-center gap-1 rounded-xl bg-[#f2f3ff] px-2.5 py-1.5 text-[11px] font-semibold text-[#131b2e] hover:bg-[#e2e7ff] transition-colors"
                            >
                              <BookOpen className="h-3 w-3 text-[#005c55]" />
                              Ledger
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditStudent(st)}
                              aria-label={`Edit ${st.fullName}`}
                              className="inline-flex items-center gap-1 rounded-xl bg-[#f2f3ff] px-2.5 py-1.5 text-[11px] font-semibold text-[#131b2e] hover:bg-[#e2e7ff] transition-colors"
                            >
                              <Edit3 className="h-3 w-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onRequestDeleteStudent(st)}
                              aria-label={`Delete ${st.fullName}`}
                              className="inline-flex items-center rounded-xl bg-[#f2f3ff] p-1.5 text-[#3e4947] hover:bg-[#ffdad6] hover:text-[#ba1a1a] transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenStudentLedger(st.studentId)}
                            aria-label={`Collect fee for ${st.fullName}`}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#005c55] px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0f766e] transition-colors"
                          >
                            <IndianRupee className="h-3 w-3" />
                            Collect
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#f2f3ff] px-5 py-3.5 text-xs text-[#3e4947]">
          <div>
            Showing{' '}
            <strong className="font-mono text-[#131b2e]">
              {filteredAndSortedRows.length === 0 ? 0 : startIdx + 1}
            </strong>{' '}
            –{' '}
            <strong className="font-mono text-[#131b2e]">
              {Math.min(
                startIdx + entriesPerPage,
                filteredAndSortedRows.length
              )}
            </strong>{' '}
            of{' '}
            <strong className="font-mono text-[#131b2e]">
              {filteredAndSortedRows.length}
            </strong>{' '}
            students
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-xs font-medium text-[#131b2e] hover:bg-[#e2e7ff] disabled:opacity-40"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(
              (pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`rounded-xl px-3 py-1.5 font-mono text-xs font-semibold ${
                    pageNum === safeCurrentPage
                      ? 'bg-[#005c55] text-white'
                      : 'bg-[#f2f3ff] text-[#3e4947] hover:bg-[#e2e7ff]'
                  }`}
                >
                  {pageNum}
                </button>
              )
            )}
            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
              className="rounded-xl bg-[#f2f3ff] px-3 py-1.5 text-xs font-medium text-[#131b2e] hover:bg-[#e2e7ff] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
