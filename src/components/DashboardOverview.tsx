import React, { useMemo } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  IndianRupee,
  PlusCircle,
  Receipt,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react';
import {
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
  isActivePayment,
} from '../utils/ledgerLogic';

interface DashboardOverviewProps {
  allStudents: StudentRecord[];
  studentsInSelectedAY: StudentInAcademicYearView[];
  payments: PaymentRecord[];
  selectedAY: string;
  availableAYs: string[];
  headerConfig: HeaderConfig;
  onNavigateToCollection: (filters?: {
    classTab?: 'ALL' | 'XI' | 'XII' | 'PENDING';
    remarkFilter?: 'ALL' | RegisterStatusCategory;
    batchFilter?: string;
  }) => void;
  onNavigateToReports: () => void;
  onOpenStudentLedger: (studentId: string) => void;
  onOpenQuickCollect: (student: StudentRecord) => void;
  onOpenCreateStudent: (tab: 'single' | 'bulk') => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  allStudents,
  studentsInSelectedAY,
  payments,
  selectedAY,
  availableAYs,
  headerConfig,
  onNavigateToCollection,
  onNavigateToReports,
  onOpenStudentLedger,
  onOpenCreateStudent,
}) => {
  // Selected AY Cohort KPIs
  const ayMetrics = useMemo(() => {
    let xiCount = 0;
    let xiiCount = 0;
    let totalPayable = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let xiPaid = 0;
    let xiiPaid = 0;
    let fullPaidStudents = 0;
    let actionRequiredCount = 0;

    studentsInSelectedAY.forEach((row) => {
      if (row.activeClassInSelectedAY === 'XI') xiCount += 1;
      else xiiCount += 1;

      totalPayable += row.student.totalIntegratedFee;
      totalPaid += row.student.totalPaid;
      totalPending += row.totalPendingIntegrated;
      xiPaid += row.student.paidClassXI;
      xiiPaid += row.student.paidClassXII;

      if (
        row.registerCategory === 'Full Paid' ||
        row.registerCategory === 'Direct XII Paid'
      ) {
        fullPaidStudents += 1;
      }

      if (
        row.registerCategory === 'XII Pending' ||
        row.registerCategory === 'XII Will Pay June 26' ||
        row.registerCategory === 'Partial Paid (₹5k Due)' ||
        row.registerCategory === 'Fee Pending'
      ) {
        actionRequiredCount += 1;
      }
    });

    const collectionRate =
      totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;

    return {
      totalStudents: studentsInSelectedAY.length,
      xiCount,
      xiiCount,
      totalPayable,
      totalPaid,
      totalPending,
      xiPaid,
      xiiPaid,
      collectionRate,
      fullPaidStudents,
      actionRequiredCount,
    };
  }, [studentsInSelectedAY]);

  // All-Batches Portfolio Comparison
  const batchComparison = useMemo(() => {
    const uniqueBatches = Array.from(
      new Set([
        ...headerConfig.batchHeads.map((b) => b.enrollmentAY),
        ...allStudents.map((s) => s.enrollmentAY),
      ])
    )
      .filter((ay) => ay !== 'ALL_BATCHES')
      .sort();

    return uniqueBatches
      .filter(
        (ay) =>
          allStudents.some((s) => s.enrollmentAY === ay) ||
          ay === selectedAY
      )
      .map((ay) => {
      const list = allStudents.filter((s) => s.enrollmentAY === ay);
      const xiPaid = list.reduce((sum, s) => sum + s.paidClassXI, 0);
      const xiiPaid = list.reduce((sum, s) => sum + s.paidClassXII, 0);
      const payable = list.reduce((sum, s) => sum + s.totalIntegratedFee, 0);
      const paid = xiPaid + xiiPaid;
      const pending = Math.max(0, payable - paid);
      const pct = payable > 0 ? Math.round((paid / payable) * 100) : 0;
      const xiPct = payable > 0 ? Math.round((xiPaid / payable) * 100) : 0;
      const xiiPct = payable > 0 ? Math.round((xiiPaid / payable) * 100) : 0;

      return {
        ay,
        nextAY: getNextAcademicYear(ay),
        count: list.length,
        xiPaid,
        xiiPaid,
        paid,
        pending,
        payable,
        pct,
        xiPct,
        xiiPct,
      };
    });
  }, [allStudents, headerConfig.batchHeads, selectedAY]);

  // Status Distribution in Selected AY
  const statusBreakdown = useMemo(() => {
    const total = studentsInSelectedAY.length || 1;
    return REGISTER_STATUS_CATEGORIES.map((item) => {
      const matches = studentsInSelectedAY.filter(
        (r) => r.registerCategory === item.category
      );
      const sumPaid = matches.reduce((s, r) => s + r.student.totalPaid, 0);
      return {
        category: item.category,
        count: matches.length,
        pct: Math.round((matches.length / total) * 100),
        sumPaid,
      };
    }).filter((item) => item.count > 0);
  }, [studentsInSelectedAY]);

  // Priority Pending Recovery Queue
  const priorityRecoveryQueue = useMemo(() => {
    return studentsInSelectedAY
      .filter(
        (r) =>
          r.registerCategory === 'XII Pending' ||
          r.registerCategory === 'Partial Paid (₹5k Due)' ||
          r.registerCategory === 'Fee Pending' ||
          r.registerCategory === 'XII Will Pay June 26'
      )
      .sort((a, b) => b.totalPendingIntegrated - a.totalPendingIntegrated)
      .slice(0, 6);
  }, [studentsInSelectedAY]);

  // Recent Active Fee Receipts (excludes soft-reversed audit entries)
  const recentReceipts = useMemo(
    () => payments.filter(isActivePayment).slice(0, 6),
    [payments]
  );

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* HEADER & QUICK ACTIONS */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#3e4947]">
            Integrated Science · Session {selectedAY}
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#131b2e]">
            Academic Overview — Session {selectedAY}
          </h1>
          <p className="mt-1 text-sm text-[#3e4947]">
            Live fee synchronization across Class XI and Class XII cohorts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onOpenCreateStudent('bulk')}
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-white text-[#131b2e] shadow-[0_1px_4px_rgba(19,27,46,0.06)] hover:bg-[#f2f3ff] transition-colors text-xs font-semibold whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5 text-[#005c55]" />
            <span>Import Excel</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateToCollection({ classTab: 'ALL' })}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-[#005c55] text-white shadow-xs hover:bg-[#0f766e] transition-colors text-xs font-semibold whitespace-nowrap"
          >
            <IndianRupee className="h-3.5 w-3.5" />
            <span>Collect Fees</span>
          </button>
        </div>
      </div>

      {/* 3-CARD CALM LEDGER BENTO STRIP (Matches Stitch Academic Overview) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Card 1: Active Enrolled Students */}
        <div className="rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(19,27,46,0.04)] flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-medium text-[#3e4947]">
                Active Enrolled Students
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold tracking-tight text-[#131b2e] tabular-nums">
                  {ayMetrics.totalStudents}
                </span>
                <span className="text-xs text-[#3e4947]">in {selectedAY}</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[#f2f3ff] flex items-center justify-center text-[#005c55] shrink-0">
              <Users className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-5 pt-3.5 border-t border-[#f2f3ff] flex items-center justify-between text-xs text-[#3e4947]">
            <button
              type="button"
              onClick={() => onNavigateToCollection({ classTab: 'XI' })}
              className="hover:text-[#005c55] font-medium transition-colors"
            >
              {headerConfig.year1ShortLabel}:{' '}
              <span className="font-mono font-bold text-[#131b2e]">
                {ayMetrics.xiCount}
              </span>
            </button>
            <span className="text-[#bdc9c6]" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={() => onNavigateToCollection({ classTab: 'XII' })}
              className="hover:text-[#005c55] font-medium transition-colors"
            >
              {headerConfig.year2ShortLabel}:{' '}
              <span className="font-mono font-bold text-[#131b2e]">
                {ayMetrics.xiiCount}
              </span>
            </button>
          </div>
        </div>

        {/* Card 2: Total Revenue Collected */}
        <div className="rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(19,27,46,0.04)] flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-medium text-[#3e4947]">
                Total Collected ({selectedAY} Cohort)
              </span>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="font-mono text-3xl font-bold tracking-tight text-[#006c49] tabular-nums">
                  {formatINR(ayMetrics.totalPaid)}
                </span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[#e6f7ef] flex items-center justify-center text-[#006c49] shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#3e4947]">
                XI: {formatINR(ayMetrics.xiPaid)} · XII:{' '}
                {formatINR(ayMetrics.xiiPaid)}
              </span>
              <span className="font-mono font-bold text-[#006c49] tabular-nums">
                {ayMetrics.collectionRate}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#eaedff] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#006c49] transition-all duration-300"
                style={{ width: `${Math.min(100, ayMetrics.collectionRate)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Pending Due Now */}
        <div className="rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(19,27,46,0.04)] flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-medium text-[#3e4947]">
                Pending Balance ({selectedAY})
              </span>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="font-mono text-3xl font-bold tracking-tight text-[#7d4200] tabular-nums">
                  {formatINR(ayMetrics.totalPending)}
                </span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[#ffdcc3]/60 flex items-center justify-center text-[#7d4200] shrink-0">
              <AlertCircle className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-5 pt-3.5 border-t border-[#f2f3ff] flex items-center justify-between text-xs">
            <span className="font-mono font-semibold text-[#7d4200] tabular-nums">
              {ayMetrics.actionRequiredCount} students due now
            </span>
            <button
              type="button"
              onClick={() => onNavigateToCollection({ classTab: 'PENDING' })}
              className="inline-flex items-center gap-1 font-semibold text-[#005c55] hover:underline"
            >
              View Pending
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* MIDDLE GRID: BATCH ROLLOVER PROGRESSION + FEE STATUS BREAKDOWN */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Batch Progression (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(19,27,46,0.04)] flex flex-col justify-between space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-[#131b2e]">
                Batch Progression &amp; Cross-Year Sync
              </h2>
              <p className="text-xs text-[#3e4947] mt-0.5">
                Class XI (Year 1) and Class XII (Year 2) collections tracked per
                admission batch.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-medium text-[#3e4947]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#005c55]" />
                {headerConfig.year1ShortLabel}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#006c49]" />
                {headerConfig.year2ShortLabel}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#eaedff]" />
                Pending
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {batchComparison.map((batch) => {
              const batchHead = getBatchHeadForAY(headerConfig, batch.ay);
              return (
                <div
                  key={batch.ay}
                  className="rounded-xl bg-[#faf8ff] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#131b2e]">
                          {batchHead.batchTitle}
                        </span>
                        <span className="text-[#bdc9c6]" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono text-xs font-medium text-[#3e4947]">
                          {batch.count} students
                        </span>
                      </div>
                      <div className="text-[11px] text-[#3e4947] mt-0.5">
                        {batchHead.classXIHeadName} → {batchHead.classXIIHeadName}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-[#006c49] tabular-nums">
                        {batch.pct}% paid
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onNavigateToCollection({ batchFilter: batch.ay })
                        }
                        className="text-xs font-semibold text-[#005c55] hover:underline whitespace-nowrap"
                      >
                        Open List →
                      </button>
                    </div>
                  </div>

                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#eaedff]">
                    <div
                      className="bg-[#005c55] transition-all duration-300"
                      style={{ width: `${batch.xiPct}%` }}
                    />
                    <div
                      className="bg-[#006c49] transition-all duration-300"
                      style={{ width: `${batch.xiiPct}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-0.5 text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-[11px] font-sans text-[#3e4947] block">
                        {headerConfig.year1ShortLabel} Paid
                      </span>
                      <span className="font-bold text-[#131b2e]">
                        {formatINR(batch.xiPaid)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] font-sans text-[#3e4947] block">
                        {headerConfig.year2ShortLabel} Paid
                      </span>
                      <span className="font-bold text-[#006c49]">
                        {formatINR(batch.xiiPaid)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-sans text-[#3e4947] block">
                        Balance
                      </span>
                      <span className="font-bold text-[#7d4200]">
                        {formatINR(batch.pending)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f2f3ff] pt-3 text-xs text-[#3e4947]">
            <span>
              Sessions:{' '}
              <span className="font-mono font-semibold text-[#131b2e]">
                {availableAYs.join(', ')}
              </span>
            </span>
            <button
              type="button"
              onClick={onNavigateToReports}
              className="font-semibold text-[#005c55] hover:underline"
            >
              Open Full Reports →
            </button>
          </div>
        </div>

        {/* Status Distribution (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(19,27,46,0.04)] space-y-4">
          <div>
            <h2 className="font-display text-base font-bold text-[#131b2e]">
              Clearance Breakdown ({selectedAY})
            </h2>
            <p className="text-xs text-[#3e4947] mt-0.5">
              Click any status to jump straight to those students.
            </p>
          </div>

          <div className="divide-y divide-[#f2f3ff]">
            {statusBreakdown.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#3e4947]">
                No students active in {selectedAY}.
              </div>
            ) : (
              statusBreakdown.map((item) => {
                const barColor =
                  item.category === 'Full Paid' ||
                  item.category === 'Direct XII Paid'
                    ? 'bg-[#006c49]'
                    : item.category === 'Only XI Paid'
                    ? 'bg-[#005c55]'
                    : item.category === 'Admission Cancelled'
                    ? 'bg-[#bdc9c6]'
                    : 'bg-[#7d4200]';

                return (
                  <button
                    key={item.category}
                    type="button"
                    onClick={() =>
                      onNavigateToCollection({ remarkFilter: item.category })
                    }
                    className="w-full py-3 text-left hover:bg-[#faf8ff] transition-colors rounded-xl px-2 -mx-2"
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-[#131b2e]">
                        {getStatusDisplayLabel(headerConfig, item.category)}
                      </span>
                      <div className="flex items-center gap-3 font-mono tabular-nums">
                        <span className="text-[#3e4947]">
                          {formatINR(item.sumPaid)}
                        </span>
                        <span className="font-bold text-[#131b2e] w-7 text-right">
                          {item.count}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eaedff]">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${Math.max(4, item.pct)}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM ACTION GRID: PRIORITY PENDING DUE + RECENT RECEIPTS */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Priority Pending Due Now (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl bg-white shadow-[0_1px_8px_rgba(19,27,46,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#f2f3ff]">
            <div>
              <h2 className="font-display text-base font-bold text-[#131b2e]">
                Pending Due Follow-Up ({selectedAY})
              </h2>
              <p className="text-xs text-[#3e4947] mt-0.5">
                Students with active Class XI or Class XII balances.
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateToReports}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#005c55] hover:underline whitespace-nowrap"
            >
              All Pending
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#f2f3ff] bg-[#faf8ff] text-[#3e4947] font-semibold">
                  <th className="py-3 px-5">Student</th>
                  <th className="py-3 px-3">Batch</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Due</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f3ff]">
                {priorityRecoveryQueue.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-xs text-[#3e4947]"
                    >
                      All active students in {selectedAY} are cleared.
                    </td>
                  </tr>
                ) : (
                  priorityRecoveryQueue.map((row) => (
                    <tr
                      key={row.student.studentId}
                      className="hover:bg-[#faf8ff] transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenStudentLedger(row.student.studentId)
                          }
                          className="font-semibold text-[#131b2e] hover:text-[#005c55] hover:underline text-left"
                        >
                          {row.student.fullName}
                        </button>
                        <div className="text-[11px] font-mono text-[#3e4947]">
                          {row.student.rollNo} ·{' '}
                          {getClassHeadDisplayName(
                            headerConfig,
                            row.student.enrollmentAY,
                            row.activeClassInSelectedAY
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-[#3e4947] whitespace-nowrap">
                        {getBatchHeadForAY(
                          headerConfig,
                          row.student.enrollmentAY
                        ).batchTitle}
                      </td>
                      <td className="py-3.5 px-3 text-[#7d4200] font-medium whitespace-nowrap">
                        {getStatusDisplayLabel(
                          headerConfig,
                          row.registerCategory
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-[#ba1a1a] tabular-nums whitespace-nowrap">
                        {formatINR(row.totalPendingIntegrated)}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenStudentLedger(row.student.studentId)
                          }
                          className="inline-flex items-center gap-1 rounded-xl bg-[#005c55] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0f766e] transition-colors"
                        >
                          <PlusCircle className="h-3 w-3" />
                          Collect
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Fee Receipts (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl bg-white shadow-[0_1px_8px_rgba(19,27,46,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#f2f3ff]">
            <div>
              <h2 className="font-display text-base font-bold text-[#131b2e]">
                Recent Receipts
              </h2>
              <p className="text-xs text-[#3e4947] mt-0.5">
                Latest verified fee payments across batches.
              </p>
            </div>
            <Receipt className="h-4 w-4 text-[#3e4947]" />
          </div>

          <div className="divide-y divide-[#f2f3ff]">
            {recentReceipts.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#3e4947]">
                No receipts recorded yet.
              </div>
            ) : (
              recentReceipts.map((rcp) => (
                <div
                  key={rcp.paymentId}
                  className="flex items-center justify-between gap-3 px-6 py-3.5 hover:bg-[#faf8ff] transition-colors"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenStudentLedger(rcp.studentId)}
                      className="block truncate text-xs font-semibold text-[#131b2e] hover:text-[#005c55] hover:underline text-left"
                    >
                      {rcp.studentName}
                    </button>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#3e4947] truncate">
                      <span className="font-mono">{rcp.receiptNo}</span>
                      <span aria-hidden="true">·</span>
                      <span>{rcp.paymentDate}</span>
                      <span aria-hidden="true">·</span>
                      <span>{rcp.paymentMode}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs font-bold text-[#006c49] tabular-nums">
                      +{formatINR(rcp.amount)}
                    </div>
                    <div className="text-[10px] font-mono text-[#3e4947]">
                      {rcp.fineAmount && rcp.fineAmount > 0
                        ? `+${formatINR(rcp.fineAmount)} fine`
                        : rcp.targetClass === 'XI'
                        ? `XI (${rcp.enrollmentAY})`
                        : rcp.targetClass === 'XII'
                        ? `XII (${rcp.progressionAY})`
                        : 'XI + XII'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
