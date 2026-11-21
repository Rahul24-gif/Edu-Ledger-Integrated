import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  HeaderConfig,
  PaymentMode,
  PaymentRecord,
  StudentRecord,
} from '../types';
import {
  aggregateCollectionByPeriod,
  formatINR,
  formatISODateLabel,
  getBatchHeadForAY,
} from '../utils/ledgerLogic';
import { exportPeriodCollectionToExcel } from '../utils/excelUtils';

interface CollectionAnalyticsPageProps {
  payments: PaymentRecord[];
  students: StudentRecord[];
  availableAYs: string[];
  headerConfig: HeaderConfig;
  onOpenStudentLedger: (studentId: string) => void;
}

const PAYMENT_MODES: PaymentMode[] = [
  'UPI',
  'Cash',
  'NEFT/RTGS',
  'Cheque',
  'Card',
  'DD',
];

const CALENDAR_MONTH_NAMES = [
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

const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type CalendarPickMode = 'single' | 'range';

function toISODate(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function addDaysISO(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return toISODate(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

export const CollectionAnalyticsPage: React.FC<
  CollectionAnalyticsPageProps
> = ({ payments, students, availableAYs, headerConfig, onOpenStudentLedger }) => {
  const [sessionScope, setSessionScope] = useState<string>('ALL');
  const [modeFilter, setModeFilter] = useState<'ALL' | PaymentMode>('ALL');
  const [fromDateISO, setFromDateISO] = useState<string | null>(null);
  const [toDateISO, setToDateISO] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<CalendarPickMode>('single');
  const [calendarOpen, setCalendarOpen] = useState<boolean>(false);
  const [receiptSearch, setReceiptSearch] = useState<string>('');

  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Full unfiltered daily report (respecting session & payment mode) for calendar activity dots
  const allDaysReport = useMemo(
    () =>
      aggregateCollectionByPeriod(payments, 'daily', {
        sessionAY: sessionScope,
        modeFilter,
      }),
    [payments, sessionScope, modeFilter]
  );

  // Map of ISO date -> bucket summary for highlighting collection dates on the calendar
  const dayBucketByISO = useMemo(() => {
    const map = new Map<
      string,
      { total: number; students: number; receipts: number }
    >();
    allDaysReport.buckets.forEach((b) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(b.key)) {
        map.set(b.key, {
          total: b.grandTotal,
          students: b.uniqueStudentCount,
          receipts: b.receiptCount,
        });
      }
    });
    return map;
  }, [allDaysReport.buckets]);

  // Latest ISO date with collection data (used as sensible initial calendar month)
  const latestActiveISO = useMemo(() => {
    const firstDated = allDaysReport.buckets.find((b) =>
      /^\d{4}-\d{2}-\d{2}$/.test(b.key)
    );
    return firstDated ? firstDated.key : new Date().toISOString().slice(0, 10);
  }, [allDaysReport.buckets]);

  const [viewYear, setViewYear] = useState<number>(() =>
    Number(latestActiveISO.slice(0, 4))
  );
  const [viewMonth, setViewMonth] = useState<number>(
    () => Number(latestActiveISO.slice(5, 7)) - 1
  );

  // Close calendar popover on outside click or Escape key
  useEffect(() => {
    if (!calendarOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setCalendarOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalendarOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [calendarOpen]);

  // Active daily report filtered by selected single date or date range
  const dailyReport = useMemo(
    () =>
      aggregateCollectionByPeriod(payments, 'daily', {
        sessionAY: sessionScope,
        modeFilter,
        fromDateISO,
        toDateISO,
      }),
    [payments, sessionScope, modeFilter, fromDateISO, toDateISO]
  );

  const isSingleDateSelected = Boolean(
    fromDateISO && toDateISO && fromDateISO === toDateISO
  );
  const isRangeSelected = Boolean(
    fromDateISO && (!toDateISO || fromDateISO !== toDateISO)
  );
  const hasDateFilter = Boolean(fromDateISO || toDateISO);

  const activeDateRangeLabel = useMemo(() => {
    if (!fromDateISO && !toDateISO) return 'All Dates';
    if (fromDateISO && toDateISO && fromDateISO === toDateISO) {
      return formatISODateLabel(fromDateISO);
    }
    if (fromDateISO && toDateISO) {
      const start = fromDateISO <= toDateISO ? fromDateISO : toDateISO;
      const end = fromDateISO <= toDateISO ? toDateISO : fromDateISO;
      return `${formatISODateLabel(start)} – ${formatISODateLabel(end)}`;
    }
    if (fromDateISO) return `From ${formatISODateLabel(fromDateISO)}`;
    return `Up to ${formatISODateLabel(toDateISO!)}`;
  }, [fromDateISO, toDateISO]);

  const studentById = useMemo(() => {
    const map = new Map<string, StudentRecord>();
    students.forEach((s) => map.set(s.studentId, s));
    return map;
  }, [students]);

  const displayedReceipts = useMemo(() => {
    const baseList = dailyReport.allMatchingReceipts;
    const q = receiptSearch.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter(
      (r) =>
        r.studentName.toLowerCase().includes(q) ||
        r.rollNo.toLowerCase().includes(q) ||
        r.receiptNo.toLowerCase().includes(q) ||
        r.paymentMode.toLowerCase().includes(q) ||
        r.paymentDate.toLowerCase().includes(q)
    );
  }, [dailyReport.allMatchingReceipts, receiptSearch]);

  const maxBucketTotal = useMemo(() => {
    return dailyReport.buckets.reduce(
      (max, b) => (b.grandTotal > max ? b.grandTotal : max),
      1
    );
  }, [dailyReport.buckets]);

  // Build calendar cells for (viewYear, viewMonth)
  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
    const daysInMonth = new Date(
      Date.UTC(viewYear, viewMonth + 1, 0)
    ).getUTCDate();

    const cells: { day: number | null; iso: string | null }[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ day: null, iso: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, iso: toISODate(viewYear, viewMonth, d) });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const openCalendar = () => {
    const anchor = fromDateISO || latestActiveISO;
    if (/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
      setViewYear(Number(anchor.slice(0, 4)));
      setViewMonth(Number(anchor.slice(5, 7)) - 1);
    }
    setCalendarOpen((prev) => !prev);
  };

  const shiftMonth = (delta: number) => {
    const dt = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(dt.getUTCFullYear());
    setViewMonth(dt.getUTCMonth());
  };

  const handleDayClick = (iso: string) => {
    if (pickMode === 'single') {
      setFromDateISO(iso);
      setToDateISO(iso);
      setCalendarOpen(false);
      return;
    }

    // Range selection mode
    if (!fromDateISO || (fromDateISO && toDateISO && fromDateISO !== toDateISO)) {
      setFromDateISO(iso);
      setToDateISO(null);
    } else if (fromDateISO && !toDateISO) {
      if (iso < fromDateISO) {
        setToDateISO(fromDateISO);
        setFromDateISO(iso);
      } else {
        setToDateISO(iso);
      }
      setCalendarOpen(false);
    } else {
      // Currently single date selected in range mode -> start fresh range
      setFromDateISO(iso);
      setToDateISO(null);
    }
  };

  const applyPreset = (
    preset: 'all' | 'latest' | 'last7' | 'last30' | 'latestMonth'
  ) => {
    if (preset === 'all') {
      setFromDateISO(null);
      setToDateISO(null);
      setCalendarOpen(false);
      return;
    }
    if (preset === 'latest') {
      setPickMode('single');
      setFromDateISO(latestActiveISO);
      setToDateISO(latestActiveISO);
      setViewYear(Number(latestActiveISO.slice(0, 4)));
      setViewMonth(Number(latestActiveISO.slice(5, 7)) - 1);
      setCalendarOpen(false);
      return;
    }
    if (preset === 'last7') {
      setPickMode('range');
      const start = addDaysISO(latestActiveISO, -6);
      setFromDateISO(start);
      setToDateISO(latestActiveISO);
      setCalendarOpen(false);
      return;
    }
    if (preset === 'last30') {
      setPickMode('range');
      const start = addDaysISO(latestActiveISO, -29);
      setFromDateISO(start);
      setToDateISO(latestActiveISO);
      setCalendarOpen(false);
      return;
    }
    if (preset === 'latestMonth') {
      setPickMode('range');
      const y = Number(latestActiveISO.slice(0, 4));
      const mIdx = Number(latestActiveISO.slice(5, 7)) - 1;
      const lastDay = new Date(Date.UTC(y, mIdx + 1, 0)).getUTCDate();
      setFromDateISO(toISODate(y, mIdx, 1));
      setToDateISO(toISODate(y, mIdx, lastDay));
      setCalendarOpen(false);
    }
  };

  const selectSingleDayFromTable = (iso: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    setPickMode('single');
    setFromDateISO(iso);
    setToDateISO(iso);
    setViewYear(Number(iso.slice(0, 4)));
    setViewMonth(Number(iso.slice(5, 7)) - 1);
  };

  const clearDateFilter = () => {
    setFromDateISO(null);
    setToDateISO(null);
  };

  const scopeLabel =
    sessionScope === 'ALL' ? 'All Sessions' : `Session ${sessionScope}`;
  const exportScopeLabel = hasDateFilter
    ? `${scopeLabel}_${activeDateRangeLabel}`
    : scopeLabel;

  // Normalized range bounds for calendar visual highlighting
  const normStart =
    fromDateISO && toDateISO
      ? fromDateISO <= toDateISO
        ? fromDateISO
        : toDateISO
      : fromDateISO;
  const normEnd =
    fromDateISO && toDateISO
      ? fromDateISO <= toDateISO
        ? toDateISO
        : fromDateISO
      : toDateISO || fromDateISO;

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* PAGE HEADER WITH CALENDAR ICON PICKER & EXCEL EXPORT */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#475569]">
            Daily Fee Register · {scopeLabel}
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#0f172a]">
            Daily Collection
          </h1>
          <p className="mt-1 text-sm text-[#475569] max-w-2xl">
            Click the calendar icon to inspect collections and paid students for
            any specific date or custom date range.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* INTERACTIVE CALENDAR ICON BUTTON + POPOVER */}
          <div className="relative" ref={popoverRef}>
            <div className="inline-flex items-center">
              <button
                type="button"
                onClick={openCalendar}
                aria-label="Open calendar to pick date or date range"
                aria-expanded={calendarOpen}
                className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                  hasDateFilter || calendarOpen
                    ? 'bg-[#005c55] text-white border-[#005c55] hover:bg-[#0f766e]'
                    : 'bg-white text-[#0f172a] border-[#cbd5e1] hover:border-[#005c55] hover:text-[#005c55]'
                }`}
              >
                <Calendar className="h-4 w-4 shrink-0" />
                <span className="tabular-nums">{activeDateRangeLabel}</span>
              </button>

              {hasDateFilter && (
                <button
                  type="button"
                  onClick={clearDateFilter}
                  aria-label="Clear selected date filter"
                  title="Show All Dates"
                  className="ml-1.5 inline-flex items-center justify-center h-9 w-9 rounded-xl bg-white border border-[#cbd5e1] text-[#475569] hover:text-[#0f172a] hover:border-[#94a3b8] transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* CALENDAR DATE & DATE-RANGE POPOVER */}
            {calendarOpen && (
              <div
                role="dialog"
                aria-label="Select date or date range"
                className="absolute right-0 mt-2 z-40 w-[332px] sm:w-[360px] rounded-2xl bg-white border border-[#cbd5e1] shadow-xl p-4 space-y-3.5"
              >
                {/* Mode Toggle: Single Date vs Date Range */}
                <div className="flex items-center justify-between gap-2">
                  <div
                    role="tablist"
                    aria-label="Calendar selection mode"
                    className="inline-flex items-center gap-1 rounded-xl bg-[#edf2f7] border border-[#dce4ee] p-1 flex-1"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={pickMode === 'single'}
                      onClick={() => {
                        setPickMode('single');
                        if (fromDateISO) setToDateISO(fromDateISO);
                      }}
                      className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        pickMode === 'single'
                          ? 'bg-[#005c55] text-white shadow-xs'
                          : 'text-[#334155] hover:text-[#0f172a]'
                      }`}
                    >
                      Single Date
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={pickMode === 'range'}
                      onClick={() => setPickMode('range')}
                      className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        pickMode === 'range'
                          ? 'bg-[#005c55] text-white shadow-xs'
                          : 'text-[#334155] hover:text-[#0f172a]'
                      }`}
                    >
                      Date Range
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCalendarOpen(false)}
                    aria-label="Close calendar"
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'all' as const, label: 'All Dates' },
                    { id: 'latest' as const, label: 'Latest Day' },
                    { id: 'last7' as const, label: 'Last 7 Days' },
                    { id: 'last30' as const, label: 'Last 30 Days' },
                    { id: 'latestMonth' as const, label: 'Full Month' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className="rounded-lg bg-[#f1f5f9] border border-[#dce4ee] px-2.5 py-1 text-[11px] font-semibold text-[#334155] hover:bg-[#e2e8f0] hover:text-[#0f172a] transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Month & Year Navigation */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className="h-8 w-8 rounded-lg border border-[#dce4ee] flex items-center justify-center text-[#334155] hover:bg-[#f1f5f9]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div className="text-sm font-bold text-[#0f172a]">
                    {CALENDAR_MONTH_NAMES[viewMonth]} {viewYear}
                  </div>

                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                    className="h-8 w-8 rounded-lg border border-[#dce4ee] flex items-center justify-center text-[#334155] hover:bg-[#f1f5f9]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {CALENDAR_WEEKDAYS.map((wd) => (
                    <div
                      key={wd}
                      className="text-[11px] font-semibold text-[#64748b] py-1"
                    >
                      {wd}
                    </div>
                  ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((cell, idx) => {
                    if (!cell.day || !cell.iso) {
                      return <div key={`empty-${idx}`} className="h-9" />;
                    }
                    const activity = dayBucketByISO.get(cell.iso);
                    const isStart = normStart === cell.iso;
                    const isEnd = normEnd === cell.iso;
                    const isSelectedEdge = isStart || isEnd;
                    const isInRange = Boolean(
                      normStart &&
                        normEnd &&
                        cell.iso > normStart &&
                        cell.iso < normEnd
                    );

                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        onClick={() => handleDayClick(cell.iso!)}
                        title={
                          activity
                            ? `${formatISODateLabel(cell.iso)}: ${formatINR(activity.total)} (${activity.students} student${activity.students === 1 ? '' : 's'})`
                            : `${formatISODateLabel(cell.iso)}: No collections`
                        }
                        className={`relative h-9 rounded-lg flex flex-col items-center justify-center text-xs font-semibold tabular-nums transition-colors ${
                          isSelectedEdge
                            ? 'bg-[#005c55] text-white'
                            : isInRange
                            ? 'bg-[#d9f3ec] text-[#005c55]'
                            : activity
                            ? 'bg-[#f1f5f9] text-[#0f172a] hover:bg-[#e2e8f0]'
                            : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
                        }`}
                      >
                        <span>{cell.day}</span>
                        {activity && (
                          <span
                            className={`h-1 w-1 rounded-full mt-0.5 ${
                              isSelectedEdge ? 'bg-[#9cf2e8]' : 'bg-[#006c49]'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Manual Date Inputs for Exact Entry */}
                <div className="pt-2.5 border-t border-[#e2e8f0] space-y-2">
                  {pickMode === 'single' ? (
                    <div>
                      <label
                        htmlFor="daily-single-date-input"
                        className="block text-[11px] font-semibold text-[#475569] mb-1"
                      >
                        Exact Date
                      </label>
                      <input
                        id="daily-single-date-input"
                        type="date"
                        value={fromDateISO || ''}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          setFromDateISO(v);
                          setToDateISO(v);
                          if (v) {
                            setViewYear(Number(v.slice(0, 4)));
                            setViewMonth(Number(v.slice(5, 7)) - 1);
                          }
                        }}
                        className="w-full h-9 rounded-xl bg-[#f1f5f9] border border-[#cbd5e1] px-3 text-xs font-semibold text-[#0f172a] focus:bg-white focus:border-[#005c55] focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor="daily-from-date-input"
                          className="block text-[11px] font-semibold text-[#475569] mb-1"
                        >
                          From Date
                        </label>
                        <input
                          id="daily-from-date-input"
                          type="date"
                          value={fromDateISO || ''}
                          onChange={(e) => {
                            const v = e.target.value || null;
                            setFromDateISO(v);
                            if (v) {
                              setViewYear(Number(v.slice(0, 4)));
                              setViewMonth(Number(v.slice(5, 7)) - 1);
                            }
                          }}
                          className="w-full h-9 rounded-xl bg-[#f1f5f9] border border-[#cbd5e1] px-2.5 text-xs font-semibold text-[#0f172a] focus:bg-white focus:border-[#005c55] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="daily-to-date-input"
                          className="block text-[11px] font-semibold text-[#475569] mb-1"
                        >
                          To Date
                        </label>
                        <input
                          id="daily-to-date-input"
                          type="date"
                          value={toDateISO || ''}
                          onChange={(e) => setToDateISO(e.target.value || null)}
                          className="w-full h-9 rounded-xl bg-[#f1f5f9] border border-[#cbd5e1] px-2.5 text-xs font-semibold text-[#0f172a] focus:bg-white focus:border-[#005c55] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#475569]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#006c49]" />
                      Dot = collection recorded
                    </span>
                    <button
                      type="button"
                      onClick={() => setCalendarOpen(false)}
                      className="rounded-lg bg-[#005c55] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f766e]"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              exportPeriodCollectionToExcel(dailyReport, exportScopeLabel)
            }
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-[#005c55] text-white hover:bg-[#0f766e] transition-colors text-xs font-semibold whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Export Daily Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR + SUMMARY TOTALS FOR SELECTED DATE / RANGE */}
      <div className="rounded-2xl bg-white border border-[#dce4ee] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-[#0f172a]">Showing:</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#e6f7ef] border border-[#b7e4cf] px-2.5 py-1 font-semibold text-[#005c55] tabular-nums">
              <Calendar className="h-3.5 w-3.5" />
              {activeDateRangeLabel}
            </span>
            {hasDateFilter && (
              <button
                type="button"
                onClick={clearDateFilter}
                className="inline-flex items-center gap-1 rounded-lg bg-[#f1f5f9] border border-[#cbd5e1] px-2.5 py-1 text-[11px] font-semibold text-[#334155] hover:bg-[#e2e8f0] hover:text-[#0f172a]"
              >
                <X className="h-3 w-3" />
                Show All Dates
              </button>
            )}
          </div>

          {/* Session & Mode Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filter daily collection by academic session"
              value={sessionScope}
              onChange={(e) => setSessionScope(e.target.value)}
              className="h-9 rounded-xl bg-[#f1f5f9] border border-[#cbd5e1] px-3 text-xs font-semibold text-[#0f172a] focus:bg-white focus:border-[#005c55] focus:outline-none"
            >
              <option value="ALL">All Sessions</option>
              {availableAYs.map((ay) => (
                <option key={ay} value={ay}>
                  Session {ay}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter daily collection by payment mode"
              value={modeFilter}
              onChange={(e) =>
                setModeFilter(e.target.value as 'ALL' | PaymentMode)
              }
              className="h-9 rounded-xl bg-[#f1f5f9] border border-[#cbd5e1] px-3 text-xs font-semibold text-[#0f172a] focus:bg-white focus:border-[#005c55] focus:outline-none"
            >
              <option value="ALL">All Payment Modes</option>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 5-Metric Summary Bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 rounded-xl bg-[#f1f5f9] border border-[#dce4ee] p-3.5 text-xs tabular-nums">
          <div>
            <span className="text-[11px] font-medium text-[#475569] block">
              Total Collected
            </span>
            <span className="text-base font-bold text-[#006c49]">
              {formatINR(dailyReport.grandTotal)}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-[#475569] block">
              Students Paid
            </span>
            <span className="text-sm font-bold text-[#0f172a]">
              {dailyReport.totalUniqueStudents} student
              {dailyReport.totalUniqueStudents === 1 ? '' : 's'} (
              {dailyReport.totalReceipts} receipts)
            </span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-[#475569] block">
              {headerConfig.year1ShortLabel}
            </span>
            <span className="text-sm font-bold text-[#0f172a]">
              {formatINR(dailyReport.xiTotal)}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-[#475569] block">
              {headerConfig.year2ShortLabel}
            </span>
            <span className="text-sm font-bold text-[#0f172a]">
              {formatINR(dailyReport.xiiTotal)}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-[#475569] block">
              Active Days · Fine
            </span>
            <span className="text-sm font-bold text-[#0f172a]">
              {dailyReport.buckets.length} day
              {dailyReport.buckets.length === 1 ? '' : 's'} ·{' '}
              <span className="text-[#9a4a00]">
                {formatINR(dailyReport.fineTotal)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* STUDENTS COLLECTION LIST (PROMINENT FIRST WHEN A DATE OR RANGE IS SELECTED) */}
      <div className="rounded-2xl bg-white border border-[#dce4ee] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[#e2e8f0]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Users className="h-4 w-4 text-[#005c55]" />
              <h2 className="font-display text-base font-bold text-[#0f172a]">
                {isSingleDateSelected
                  ? `Students Paid on ${activeDateRangeLabel}`
                  : isRangeSelected
                  ? `Students Paid (${activeDateRangeLabel})`
                  : `Daily Student Receipts (${scopeLabel})`}
              </h2>
            </div>
            <p className="text-xs text-[#475569] mt-0.5 tabular-nums">
              Showing {displayedReceipts.length} receipt
              {displayedReceipts.length === 1 ? '' : 's'} · Total{' '}
              <strong className="text-[#006c49]">
                {formatINR(
                  displayedReceipts.reduce(
                    (sum, r) =>
                      sum +
                      (Number(r.amount) || 0) +
                      Math.max(0, Number(r.fineAmount) || 0),
                    0
                  )
                )}
              </strong>
            </p>
          </div>

          {/* Search inside students list */}
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#475569]" />
            <input
              type="text"
              aria-label="Search paid students and receipts"
              value={receiptSearch}
              onChange={(e) => setReceiptSearch(e.target.value)}
              placeholder="Search student, EC No, receipt..."
              className="w-full h-9 rounded-xl bg-[#f1f5f9] border border-[#cbd5e1] pl-8 pr-8 text-xs text-[#0f172a] placeholder:text-[#64748b] focus:bg-white focus:border-[#005c55] focus:outline-none"
            />
            {receiptSearch && (
              <button
                type="button"
                aria-label="Clear receipt search"
                onClick={() => setReceiptSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#0f172a]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#dce4ee] bg-[#f1f5f9] text-[11px] font-semibold text-[#334155]">
                <th className="py-3 px-5 whitespace-nowrap">Date</th>
                <th className="py-3 px-3 whitespace-nowrap">Receipt No.</th>
                <th className="py-3 px-3">Student &amp; Batch</th>
                <th className="py-3 px-3 whitespace-nowrap">Fee Head</th>
                <th className="py-3 px-3 whitespace-nowrap">Mode</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">
                  Tuition
                </th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Fine</th>
                <th className="py-3 px-5 text-right whitespace-nowrap">
                  Total Paid
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {displayedReceipts.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-xs text-[#475569]"
                  >
                    No student collections recorded for{' '}
                    <strong className="text-[#0f172a]">
                      {activeDateRangeLabel}
                    </strong>
                    . Use the calendar icon above to choose another date or
                    range.
                  </td>
                </tr>
              ) : (
                displayedReceipts.slice(0, 200).map((rcp) => {
                  const fine = Math.max(0, Number(rcp.fineAmount) || 0);
                  const total = rcp.amount + fine;
                  const linkedStudent = studentById.get(rcp.studentId);
                  const batchHead = getBatchHeadForAY(
                    headerConfig,
                    rcp.enrollmentAY
                  );

                  return (
                    <tr
                      key={rcp.paymentId}
                      className="hover:bg-[#f8fafc] transition-colors"
                    >
                      <td className="py-3 px-5 text-[#334155] tabular-nums whitespace-nowrap">
                        {rcp.paymentDate}
                      </td>
                      <td className="py-3 px-3 font-semibold text-[#0f172a] tabular-nums whitespace-nowrap">
                        {rcp.receiptNo}
                      </td>
                      <td className="py-3 px-3">
                        {linkedStudent ? (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenStudentLedger(linkedStudent.studentId)
                            }
                            className="font-semibold text-[#0f172a] hover:text-[#005c55] hover:underline text-left"
                          >
                            {rcp.studentName}
                          </button>
                        ) : (
                          <span className="font-semibold text-[#0f172a]">
                            {rcp.studentName}
                          </span>
                        )}
                        <div className="text-[11px] text-[#475569] tabular-nums">
                          {rcp.rollNo} · {batchHead.batchTitle}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-[#334155] whitespace-nowrap">
                        {rcp.allocatedToXI > 0 && rcp.allocatedToXII > 0
                          ? `${headerConfig.year1ShortLabel} + ${headerConfig.year2ShortLabel}`
                          : rcp.allocatedToXI > 0
                          ? headerConfig.year1ShortLabel
                          : headerConfig.year2ShortLabel}
                      </td>
                      <td className="py-3 px-3 font-medium text-[#0f172a] whitespace-nowrap">
                        {rcp.paymentMode}
                      </td>
                      <td className="py-3 px-3 text-right text-[#0f172a] tabular-nums whitespace-nowrap">
                        {formatINR(rcp.amount)}
                      </td>
                      <td className="py-3 px-3 text-right text-[#9a4a00] tabular-nums whitespace-nowrap">
                        {fine > 0 ? formatINR(fine) : '₹0'}
                      </td>
                      <td className="py-3 px-5 text-right font-bold text-[#006c49] tabular-nums whitespace-nowrap">
                        {formatINR(total)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {displayedReceipts.length > 200 && (
          <div className="px-5 py-3 border-t border-[#e2e8f0] bg-[#f8fafc] text-[11px] text-[#475569] text-right">
            Showing latest 200 receipts on screen. Use{' '}
            <strong className="text-[#0f172a]">
              Export Daily Excel (.xlsx)
            </strong>{' '}
            to download all {displayedReceipts.length} receipts.
          </div>
        )}
      </div>

      {/* DAY-WISE COLLECTION REGISTER (CLICK ANY DATE TO FILTER ITS STUDENTS LIST) */}
      {!isSingleDateSelected && (
        <div className="rounded-2xl bg-white border border-[#dce4ee] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#e2e8f0]">
            <div>
              <h2 className="font-display text-base font-bold text-[#0f172a]">
                Day-Wise Collection Summary
              </h2>
              <p className="text-xs text-[#475569] mt-0.5">
                Click any date&apos;s <strong>View Students</strong> button to
                open that exact day&apos;s student list.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-medium text-[#475569]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#005c55]" />
                {headerConfig.year1ShortLabel}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#006c49]" />
                {headerConfig.year2ShortLabel}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#dce4ee] bg-[#f1f5f9] text-[11px] font-semibold text-[#334155]">
                  <th className="py-3 px-5 whitespace-nowrap">Date</th>
                  <th className="py-3 px-3 whitespace-nowrap">Distribution</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    Students
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    {headerConfig.year1ShortLabel}
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    {headerConfig.year2ShortLabel}
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    Fine
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    Total Collected
                  </th>
                  <th className="py-3 px-5 text-right whitespace-nowrap">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {dailyReport.buckets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-10 text-center text-xs text-[#475569]"
                    >
                      No daily collection records match the selected date range.
                    </td>
                  </tr>
                ) : (
                  dailyReport.buckets.map((bucket) => {
                    const barTotalPct = Math.max(
                      4,
                      Math.round((bucket.grandTotal / maxBucketTotal) * 100)
                    );
                    const xiShare =
                      bucket.tuitionTotal > 0
                        ? Math.round(
                            (bucket.xiTotal / bucket.tuitionTotal) * 100
                          )
                        : 0;
                    const xiiShare = Math.max(0, 100 - xiShare);
                    const isDatedBucket = /^\d{4}-\d{2}-\d{2}$/.test(
                      bucket.key
                    );

                    return (
                      <tr
                        key={bucket.key}
                        className="hover:bg-[#f8fafc] transition-colors"
                      >
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <div className="font-semibold text-[#0f172a]">
                            {bucket.label}
                          </div>
                          <div className="text-[11px] text-[#475569]">
                            {bucket.sublabel} · {bucket.receiptCount} receipt
                            {bucket.receiptCount === 1 ? '' : 's'}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 min-w-[160px]">
                          <div className="h-2.5 w-full rounded-full bg-[#e2e8f0] overflow-hidden">
                            <div
                              className="h-full flex overflow-hidden rounded-full"
                              style={{ width: `${barTotalPct}%` }}
                            >
                              <div
                                className="bg-[#005c55] h-full"
                                style={{ width: `${xiShare}%` }}
                              />
                              <div
                                className="bg-[#006c49] h-full"
                                style={{ width: `${xiiShare}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-semibold text-[#0f172a] tabular-nums whitespace-nowrap">
                          {bucket.uniqueStudentCount}
                        </td>
                        <td className="py-3.5 px-3 text-right font-medium text-[#0f172a] tabular-nums whitespace-nowrap">
                          {formatINR(bucket.xiTotal)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-medium text-[#006c49] tabular-nums whitespace-nowrap">
                          {formatINR(bucket.xiiTotal)}
                        </td>
                        <td className="py-3.5 px-3 text-right text-[#9a4a00] tabular-nums whitespace-nowrap">
                          {bucket.fineTotal > 0
                            ? formatINR(bucket.fineTotal)
                            : '₹0'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-bold text-[#006c49] tabular-nums whitespace-nowrap">
                          {formatINR(bucket.grandTotal)}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          {isDatedBucket ? (
                            <button
                              type="button"
                              onClick={() =>
                                selectSingleDayFromTable(bucket.key)
                              }
                              className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-semibold bg-[#edf2f7] text-[#0f172a] border border-[#cbd5e1] hover:bg-[#005c55] hover:text-white hover:border-[#005c55] transition-colors whitespace-nowrap"
                            >
                              <span>View Students</span>
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#64748b]">
                              Opening entry
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {dailyReport.buckets.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[#cbd5e1] bg-[#f1f5f9] text-xs font-bold text-[#0f172a] tabular-nums">
                    <td className="py-3.5 px-5" colSpan={2}>
                      GRAND TOTAL ({dailyReport.buckets.length} Days)
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      {dailyReport.totalUniqueStudents}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      {formatINR(dailyReport.xiTotal)}
                    </td>
                    <td className="py-3.5 px-3 text-right text-[#006c49]">
                      {formatINR(dailyReport.xiiTotal)}
                    </td>
                    <td className="py-3.5 px-3 text-right text-[#9a4a00]">
                      {formatINR(dailyReport.fineTotal)}
                    </td>
                    <td className="py-3.5 px-3 text-right text-[#006c49]">
                      {formatINR(dailyReport.grandTotal)}
                    </td>
                    <td className="py-3.5 px-5" />
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
