import ExcelJS from 'exceljs';
import {
  DEFAULT_FEE_STRUCTURE_SETTINGS,
  FeeStructureSettings,
  HeaderConfig,
  PaymentRecord,
  PeriodCollectionReport,
  REGISTER_STATUS_CATEGORIES,
  StudentInAcademicYearView,
  StudentRecord,
  WorkspaceBackupPayload,
} from '../types';
import {
  buildDefaultHeaderConfig,
  CashbookSummary,
  getBatchHeadForAY,
  getStatusDisplayLabel,
  getNextAcademicYear,
  normalizeHeaderConfig,
  safeJsonParse,
  sanitizePaymentPayload,
  sanitizeStudentPayload,
} from './ledgerLogic';

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_STUDENT_ROWS = 5000;
export const MAX_BACKUP_PAYMENT_ROWS = 25000;

const FORMULA_TRIGGER_RE = /^[\s\u0000-\u001f]*[=+@]/;
const NEGATIVE_FORMULA_RE = /^[\s\u0000-\u001f]*-/;

/**
 * Neutralizes spreadsheet formula injection (CSV/Excel DDE & formula execution)
 * by prefixing a leading single quote whenever untrusted text starts with =, +, @,
 * tab/CR control characters, or '-' (while preserving the lone '-' empty-date placeholder).
 */
export function sanitizeSpreadsheetCellText(value: unknown): string {
  const str = String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (!str) return '';
  if (str.trim() === '-') return '-';
  if (
    /^[\t\r\n]/.test(str) ||
    FORMULA_TRIGGER_RE.test(str) ||
    NEGATIVE_FORMULA_RE.test(str)
  ) {
    return `'${str}`;
  }
  return str;
}

/**
 * Formats a CSV cell safely: neutralizes leading formula characters, escapes embedded quotes, and wraps in double quotes.
 */
export function formatSafeCsvCell(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  const safeText = sanitizeSpreadsheetCellText(value);
  return `"${safeText.replace(/"/g, '""')}"`;
}

/**
 * Sanitizes a dynamic filename segment to prevent path traversal or invalid download filenames.
 */
export function sanitizeDownloadFilenamePart(
  value: string,
  fallback = 'Export'
): string {
  const cleaned = String(value || '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return cleaned || fallback;
}

async function triggerWorkbookDownload(
  workbook: ExcelJS.Workbook,
  filename: string
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const REPORT_EXCEL_COLUMNS = [
  'Sr. No.',
  'EC No.',
  'Student Name',
  'Admission Batch',
  'Class in Selected A.Y.',
  'Section / Stream',
  'XI Payment Date',
  'Term - I (Class XI) Paid',
  'XII Payment Date',
  'Term - II (Class XII) Paid',
  'Total Integrated Paid',
  'Total Pending Balance',
  'Fee Status / Remark',
] as const;

export interface ReportExcelExportOptions {
  headerConfig?: HeaderConfig;
  schoolDisplayName?: string;
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

const HEADER_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF00453F' } },
  left: { style: 'thin', color: { argb: 'FF0F766E' } },
  bottom: { style: 'medium', color: { argb: 'FF003B36' } },
  right: { style: 'thin', color: { argb: 'FF0F766E' } },
};

const TOTAL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF005C55' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'double', color: { argb: 'FF005C55' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

const INR_NUM_FMT = '#,##0';
const PCT_NUM_FMT = '0.0%';

function getExportDateDisplay(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function getStatusFontColor(statusLabel: string): string {
  const lower = statusLabel.toLowerCase();
  if (lower.includes('full paid') || lower.includes('direct xii paid')) {
    return 'FF006C49';
  }
  if (lower.includes('partial') || lower.includes('june')) {
    return 'FF9A3412';
  }
  if (lower.includes('pending') || lower.includes('cancelled')) {
    return 'FFBA1A1A';
  }
  return 'FF131B2E';
}

function applyStandardPageSetup(
  sheet: ExcelJS.Worksheet,
  schoolName: string,
  repeatHeaderRange?: string
) {
  sheet.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    verticalCentered: false,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.4,
      header: 0.15,
      footer: 0.2,
    },
    ...(repeatHeaderRange ? { printTitlesRow: repeatHeaderRange } : {}),
  };

  sheet.headerFooter = {
    oddFooter: `&L${schoolName} — Integrated Science Fee Report&RPage &P of &N`,
  };
}

function populateClassRegisterSheet(
  sheet: ExcelJS.Worksheet,
  sheetTitle: string,
  rows: StudentInAcademicYearView[],
  selectedAY: string,
  headerConfig: HeaderConfig,
  schoolName: string
) {
  const sessionLabel =
    selectedAY === 'ALL_BATCHES' ? 'All Academic Years' : `Session ${selectedAY}`;
  const exportDate = getExportDateDisplay();

  // Row 1: Institutional Title Banner
  const safeSchoolName = sanitizeSpreadsheetCellText(schoolName);
  sheet.mergeCells('A1:M1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `${safeSchoolName} — ${sheetTitle} Fee Register`;
  titleCell.font = {
    name: 'Calibri',
    size: 14,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF131B2E' },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 28;

  // Row 2: Subtitle metadata
  sheet.mergeCells('A2:M2');
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = `${sessionLabel}  |  Generated: ${exportDate}  |  Total Students: ${rows.length}`;
  subtitleCell.font = {
    name: 'Calibri',
    size: 10,
    italic: true,
    color: { argb: 'FF334155' },
  };
  subtitleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(2).height = 20;

  // Row 3: Compact visual spacer
  sheet.getRow(3).height = 7;

  // Row 4: Exact 13 Column Headers matching user reference
  const headerRow = sheet.getRow(4);
  headerRow.height = 32;
  REPORT_EXCEL_COLUMNS.forEach((colLabel, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = colLabel;
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF005C55' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = HEADER_BORDER;
  });

  // Track max text lengths for auto-fit column widths (zero truncation)
  let maxNameLen = 18;
  let maxBatchLen = 14;
  let maxStreamLen = 18;
  let maxStatusLen = 18;
  let maxEcLen = 10;

  // Data Rows starting at Row 5
  const dataStartRow = 5;
  rows.forEach((row, idx) => {
    const excelRowNum = dataStartRow + idx;
    const batchLabel = sanitizeSpreadsheetCellText(
      getBatchHeadForAY(headerConfig, row.student.enrollmentAY).batchTitle
    );
    const classLabel = `Grade-${row.activeClassInSelectedAY}`;
    const streamLabel = sanitizeSpreadsheetCellText(
      row.student.stream || 'Science (Integrated)'
    );
    const xiDate = sanitizeSpreadsheetCellText(row.student.xiPaymentDate || '-');
    const xiiDate = sanitizeSpreadsheetCellText(
      row.student.xiiPaymentDate || '-'
    );
    const statusLabel = sanitizeSpreadsheetCellText(
      getStatusDisplayLabel(headerConfig, row.registerCategory)
    );
    const safeRollNo = sanitizeSpreadsheetCellText(row.student.rollNo);
    const safeFullName = sanitizeSpreadsheetCellText(row.student.fullName);

    maxNameLen = Math.max(maxNameLen, safeFullName.length);
    maxBatchLen = Math.max(maxBatchLen, batchLabel.length);
    maxStreamLen = Math.max(maxStreamLen, streamLabel.length);
    maxStatusLen = Math.max(maxStatusLen, statusLabel.length);
    maxEcLen = Math.max(maxEcLen, safeRollNo.length);

    const dataRow = sheet.getRow(excelRowNum);
    dataRow.height = 22;

    const totalIntegratedCalc =
      row.student.paidClassXI + row.student.paidClassXII;

    const rowValues: ExcelJS.CellValue[] = [
      idx + 1,
      safeRollNo,
      safeFullName,
      batchLabel,
      classLabel,
      streamLabel,
      xiDate,
      row.student.paidClassXI,
      xiiDate,
      row.student.paidClassXII,
      {
        formula: `H${excelRowNum}+J${excelRowNum}`,
        result: totalIntegratedCalc,
      },
      row.totalPendingIntegrated,
      statusLabel,
    ];

    const isZebra = idx % 2 === 1;

    rowValues.forEach((val, colIdx) => {
      const cell = dataRow.getCell(colIdx + 1);
      cell.value = val;
      cell.border = THIN_BORDER;

      if (isZebra) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }

      const isAmountCol =
        colIdx === 7 || colIdx === 9 || colIdx === 10 || colIdx === 11;
      const isCenterCol =
        colIdx === 0 ||
        colIdx === 1 ||
        colIdx === 4 ||
        colIdx === 6 ||
        colIdx === 8;

      cell.alignment = {
        vertical: 'middle',
        horizontal: isAmountCol
          ? 'right'
          : isCenterCol
          ? 'center'
          : 'left',
        wrapText: colIdx === 2 || colIdx === 5 || colIdx === 12,
      };

      if (isAmountCol) {
        cell.numFmt = INR_NUM_FMT;
      }

      if (colIdx === 12) {
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: true,
          color: { argb: getStatusFontColor(statusLabel) },
        };
      } else if (colIdx === 10) {
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: true,
          color: { argb: 'FF006C49' },
        };
      } else if (colIdx === 11 && row.totalPendingIntegrated > 0) {
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: true,
          color: { argb: 'FFBA1A1A' },
        };
      } else {
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: colIdx === 2,
          color: { argb: 'FF131B2E' },
        };
      }
    });
  });

  // Footer TOTAL Row with live Excel SUM formulas
  const dataEndRow = dataStartRow + rows.length - 1;
  const totalRowNum = rows.length > 0 ? dataEndRow + 1 : dataStartRow;
  const totalRow = sheet.getRow(totalRowNum);
  totalRow.height = 25;

  const xiSum = rows.reduce((s, r) => s + r.student.paidClassXI, 0);
  const xiiSum = rows.reduce((s, r) => s + r.student.paidClassXII, 0);
  const totalPaidSum = xiSum + xiiSum;
  const totalPendingSum = rows.reduce(
    (s, r) => s + r.totalPendingIntegrated,
    0
  );

  for (let col = 1; col <= 13; col += 1) {
    const cell = totalRow.getCell(col);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F7EF' },
    };
    cell.border = TOTAL_BORDER;
    cell.font = {
      name: 'Calibri',
      size: 10.5,
      bold: true,
      color: { argb: 'FF131B2E' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  totalRow.getCell(1).value = '';
  totalRow.getCell(2).value =
    rows.length > 0
      ? { formula: `COUNTA(C${dataStartRow}:C${dataEndRow})`, result: rows.length }
      : 0;
  totalRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };

  totalRow.getCell(3).value = `TOTAL (${sheetTitle})`;
  totalRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };

  const setSumCell = (
    colIndex: number,
    colLetter: string,
    cachedSum: number,
    colorArgb: string
  ) => {
    const cell = totalRow.getCell(colIndex);
    cell.value =
      rows.length > 0
        ? {
            formula: `SUM(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})`,
            result: cachedSum,
          }
        : 0;
    cell.numFmt = INR_NUM_FMT;
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
    cell.font = {
      name: 'Calibri',
      size: 10.5,
      bold: true,
      color: { argb: colorArgb },
    };
  };

  setSumCell(8, 'H', xiSum, 'FF131B2E');
  setSumCell(10, 'J', xiiSum, 'FF131B2E');
  setSumCell(11, 'K', totalPaidSum, 'FF006C49');
  setSumCell(12, 'L', totalPendingSum, 'FFBA1A1A');

  // Auto-calculated generous column widths so zero headers or values truncate
  const colWidths = [
    8, // Sr. No.
    Math.min(18, Math.max(13, maxEcLen + 3)), // EC No.
    Math.min(34, Math.max(24, maxNameLen + 3)), // Student Name
    Math.min(22, Math.max(16, maxBatchLen + 3)), // Admission Batch
    16, // Class in Selected A.Y.
    Math.min(24, Math.max(20, maxStreamLen + 3)), // Section / Stream
    15, // XI Payment Date
    16, // Term - I (Class XI) Paid
    15, // XII Payment Date
    16, // Term - II (Class XII) Paid
    16, // Total Integrated Paid
    16, // Total Pending Balance
    Math.min(26, Math.max(21, maxStatusLen + 3)), // Fee Status / Remark
  ];

  colWidths.forEach((width, idx) => {
    sheet.getColumn(idx + 1).width = width;
  });

  // Freeze header pane and set print-ready A4 Landscape page setup
  sheet.views = [{ state: 'frozen', ySplit: 4, showGridLines: true }];
  applyStandardPageSetup(sheet, schoolName, '1:4');
}

function populateConsolidatedSheet(
  sheet: ExcelJS.Worksheet,
  classXIRows: StudentInAcademicYearView[],
  classXIIRows: StudentInAcademicYearView[],
  selectedAY: string,
  headerConfig: HeaderConfig,
  schoolName: string
) {
  const sessionLabel =
    selectedAY === 'ALL_BATCHES' ? 'All Academic Years' : `Session ${selectedAY}`;
  const exportDate = getExportDateDisplay();

  const partialLabel = sanitizeSpreadsheetCellText(
    getStatusDisplayLabel(headerConfig, 'Partial Paid (₹5k Due)')
  );
  const cancelledLabel = sanitizeSpreadsheetCellText(
    getStatusDisplayLabel(headerConfig, 'Admission Cancelled')
  );

  // Helper to compute exact cached metrics matching the live Excel formulas
  const computeClassMetrics = (
    rows: StudentInAcademicYearView[],
    activeClass: 'XI' | 'XII'
  ) => {
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;
    let cancelledCount = 0;
    let totalPaid = 0;
    let totalPending = 0;

    rows.forEach((r) => {
      const statusLabel = sanitizeSpreadsheetCellText(
        getStatusDisplayLabel(headerConfig, r.registerCategory)
      );
      const classPaid =
        activeClass === 'XI' ? r.student.paidClassXI : r.student.paidClassXII;

      if (statusLabel === cancelledLabel) {
        cancelledCount += 1;
      } else if (statusLabel === partialLabel) {
        partialCount += 1;
      } else if (classPaid > 0) {
        paidCount += 1;
      } else {
        unpaidCount += 1;
      }

      totalPaid += r.student.paidClassXI + r.student.paidClassXII;
      totalPending += r.totalPendingIntegrated;
    });

    const totalStudents = rows.length;
    const totalUnpaidOrPending = partialCount + unpaidCount;
    const collectionPct =
      totalPaid + totalPending > 0
        ? totalPaid / (totalPaid + totalPending)
        : 0;

    return {
      totalStudents,
      paidCount,
      partialCount,
      unpaidCount,
      cancelledCount,
      totalUnpaidOrPending,
      totalPaid,
      totalPending,
      collectionPct,
    };
  };

  const xiMetrics = computeClassMetrics(classXIRows, 'XI');
  const xiiMetrics = computeClassMetrics(classXIIRows, 'XII');

  const grandTotalStudents = xiMetrics.totalStudents + xiiMetrics.totalStudents;
  const grandPaidCount = xiMetrics.paidCount + xiiMetrics.paidCount;
  const grandPartialCount = xiMetrics.partialCount + xiiMetrics.partialCount;
  const grandUnpaidCount = xiMetrics.unpaidCount + xiiMetrics.unpaidCount;
  const grandCancelledCount =
    xiMetrics.cancelledCount + xiiMetrics.cancelledCount;
  const grandTotalUnpaid =
    xiMetrics.totalUnpaidOrPending + xiiMetrics.totalUnpaidOrPending;
  const grandTotalPaid = xiMetrics.totalPaid + xiiMetrics.totalPaid;
  const grandTotalPending = xiMetrics.totalPending + xiiMetrics.totalPending;
  const grandCollectionPct =
    grandTotalPaid + grandTotalPending > 0
      ? grandTotalPaid / (grandTotalPaid + grandTotalPending)
      : 0;

  // Row 1: Title Banner
  sheet.mergeCells('A1:J1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `${sanitizeSpreadsheetCellText(schoolName)} — Consolidated Fee Summary`;
  titleCell.font = {
    name: 'Calibri',
    size: 14,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF131B2E' },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 30;

  // Row 2: Subtitle
  sheet.mergeCells('A2:J2');
  const subCell = sheet.getCell('A2');
  subCell.value = `${sessionLabel}  |  Generated: ${exportDate}  |  All Totals Auto-Calculated via Live Excel Formulas`;
  subCell.font = {
    name: 'Calibri',
    size: 10,
    italic: true,
    color: { argb: 'FF334155' },
  };
  subCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(2).height = 20;

  // Row 3: Spacer
  sheet.getRow(3).height = 8;

  // Row 4: Section 1 Title
  sheet.mergeCells('A4:J4');
  const sec1Cell = sheet.getCell('A4');
  sec1Cell.value =
    '1. CLASS-WISE STUDENT COUNT (PAID & UNPAID) AND FEE SUMMARY';
  sec1Cell.font = {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FF005C55' },
  };
  sec1Cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE6F7EF' },
  };
  sec1Cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(4).height = 24;

  // Row 5: Section 1 Column Headers
  const sec1Headers = [
    'Class',
    'Total Students',
    'Paid Students',
    'Partial-Paid',
    'Unpaid Students',
    'Cancelled',
    'Total Unpaid / Pending',
    'Total Paid (₹)',
    'Total Pending (₹)',
    'Collection %',
  ];
  const row5 = sheet.getRow(5);
  row5.height = 30;
  sec1Headers.forEach((label, idx) => {
    const cell = row5.getCell(idx + 1);
    cell.value = label;
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF005C55' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = HEADER_BORDER;
  });

  // Helper to populate Row 6 (Class XI) and Row 7 (Class XII) with live cross-sheet formulas
  const writeClassSummaryRow = (
    rowNum: number,
    classLabel: string,
    sheetName: 'Class XI' | 'Class XII',
    paidColLetter: 'H' | 'J',
    rowCount: number,
    metrics: ReturnType<typeof computeClassMetrics>,
    isZebra: boolean
  ) => {
    const r = sheet.getRow(rowNum);
    r.height = 24;
    const endRow = 4 + rowCount;
    const hasRows = rowCount > 0;
    const safePartial = partialLabel.replace(/"/g, '""');
    const safeCancelled = cancelledLabel.replace(/"/g, '""');

    const values: ExcelJS.CellValue[] = [
      classLabel,
      hasRows
        ? {
            formula: `COUNTA('${sheetName}'!C5:C${endRow})`,
            result: metrics.totalStudents,
          }
        : 0,
      hasRows
        ? {
            formula: `COUNTIFS('${sheetName}'!${paidColLetter}5:${paidColLetter}${endRow},">0",'${sheetName}'!M5:M${endRow},"<>${safePartial}",'${sheetName}'!M5:M${endRow},"<>${safeCancelled}")`,
            result: metrics.paidCount,
          }
        : 0,
      hasRows
        ? {
            formula: `COUNTIF('${sheetName}'!M5:M${endRow},"${safePartial}")`,
            result: metrics.partialCount,
          }
        : 0,
      hasRows
        ? {
            formula: `COUNTIFS('${sheetName}'!${paidColLetter}5:${paidColLetter}${endRow},0,'${sheetName}'!M5:M${endRow},"<>${safePartial}",'${sheetName}'!M5:M${endRow},"<>${safeCancelled}")`,
            result: metrics.unpaidCount,
          }
        : 0,
      hasRows
        ? {
            formula: `COUNTIF('${sheetName}'!M5:M${endRow},"${safeCancelled}")`,
            result: metrics.cancelledCount,
          }
        : 0,
      {
        formula: `D${rowNum}+E${rowNum}`,
        result: metrics.totalUnpaidOrPending,
      },
      hasRows
        ? {
            formula: `SUM('${sheetName}'!K5:K${endRow})`,
            result: metrics.totalPaid,
          }
        : 0,
      hasRows
        ? {
            formula: `SUM('${sheetName}'!L5:L${endRow})`,
            result: metrics.totalPending,
          }
        : 0,
      {
        formula: `IF((H${rowNum}+I${rowNum})>0,H${rowNum}/(H${rowNum}+I${rowNum}),0)`,
        result: metrics.collectionPct,
      },
    ];

    values.forEach((val, idx) => {
      const cell = r.getCell(idx + 1);
      cell.value = val;
      cell.border = THIN_BORDER;
      if (isZebra) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }

      if (idx === 0) {
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        cell.font = {
          name: 'Calibri',
          size: 10.5,
          bold: true,
          color: { argb: 'FF131B2E' },
        };
      } else if (idx >= 1 && idx <= 6) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.numFmt = '#,##0';
        const color =
          idx === 2
            ? 'FF006C49'
            : idx === 3
            ? 'FF9A3412'
            : idx === 4 || idx === 6
            ? 'FFBA1A1A'
            : 'FF131B2E';
        cell.font = {
          name: 'Calibri',
          size: 10.5,
          bold: idx === 1 || idx === 2 || idx === 6,
          color: { argb: color },
        };
      } else if (idx === 7 || idx === 8) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = INR_NUM_FMT;
        cell.font = {
          name: 'Calibri',
          size: 10.5,
          bold: true,
          color: { argb: idx === 7 ? 'FF006C49' : 'FFBA1A1A' },
        };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.numFmt = PCT_NUM_FMT;
        cell.font = {
          name: 'Calibri',
          size: 10.5,
          bold: true,
          color: { argb: 'FF005C55' },
        };
      }
    });
  };

  writeClassSummaryRow(
    6,
    'Class XI',
    'Class XI',
    'H',
    classXIRows.length,
    xiMetrics,
    false
  );
  writeClassSummaryRow(
    7,
    'Class XII',
    'Class XII',
    'J',
    classXIIRows.length,
    xiiMetrics,
    true
  );

  // Row 8: GRAND TOTAL (Formula-based sum of Class XI + Class XII)
  const grandRow = sheet.getRow(8);
  grandRow.height = 26;
  const grandCells: ExcelJS.CellValue[] = [
    'GRAND TOTAL',
    { formula: 'SUM(B6:B7)', result: grandTotalStudents },
    { formula: 'SUM(C6:C7)', result: grandPaidCount },
    { formula: 'SUM(D6:D7)', result: grandPartialCount },
    { formula: 'SUM(E6:E7)', result: grandUnpaidCount },
    { formula: 'SUM(F6:F7)', result: grandCancelledCount },
    { formula: 'SUM(G6:G7)', result: grandTotalUnpaid },
    { formula: 'SUM(H6:H7)', result: grandTotalPaid },
    { formula: 'SUM(I6:I7)', result: grandTotalPending },
    {
      formula: 'IF((H8+I8)>0,H8/(H8+I8),0)',
      result: grandCollectionPct,
    },
  ];

  grandCells.forEach((val, idx) => {
    const cell = grandRow.getCell(idx + 1);
    cell.value = val;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F7EF' },
    };
    cell.border = TOTAL_BORDER;
    if (idx === 0) {
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FF131B2E' },
      };
    } else if (idx >= 1 && idx <= 6) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.numFmt = '#,##0';
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: {
          argb:
            idx === 2
              ? 'FF006C49'
              : idx === 4 || idx === 6
              ? 'FFBA1A1A'
              : 'FF131B2E',
        },
      };
    } else if (idx === 7 || idx === 8) {
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.numFmt = INR_NUM_FMT;
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: idx === 7 ? 'FF006C49' : 'FFBA1A1A' },
      };
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.numFmt = PCT_NUM_FMT;
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FF005C55' },
      };
    }
  });

  // Row 9: Spacer
  sheet.getRow(9).height = 14;

  // Row 10: Section 2 Title
  sheet.mergeCells('A10:J10');
  const sec2Cell = sheet.getCell('A10');
  sec2Cell.value =
    '2. STATUS-WISE CONSOLIDATED BREAKDOWN (LIVE COUNTIF & SUMIF FORMULAS)';
  sec2Cell.font = {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FF005C55' },
  };
  sec2Cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE6F7EF' },
  };
  sec2Cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(10).height = 24;

  // Row 11: Section 2 Headers
  const sec2Headers = [
    'Fee Status / Remark',
    'Class XI Count',
    'Class XII Count',
    'Total Students',
    'Term-I (XI) Paid (₹)',
    'Term-II (XII) Paid (₹)',
    'Total Paid (₹)',
    'Total Pending (₹)',
    '% of Students',
    'Classification',
  ];
  const row11 = sheet.getRow(11);
  row11.height = 30;
  sec2Headers.forEach((label, idx) => {
    const cell = row11.getCell(idx + 1);
    cell.value = label;
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF005C55' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = HEADER_BORDER;
  });

  const xiEnd = 4 + classXIRows.length;
  const xiiEnd = 4 + classXIIRows.length;
  const hasXI = classXIRows.length > 0;
  const hasXII = classXIIRows.length > 0;

  const statusStartRow = 12;
  const statusTotalRow = statusStartRow + REGISTER_STATUS_CATEGORIES.length;

  let sumXIStatusCount = 0;
  let sumXIIStatusCount = 0;
  let sumXITermPaid = 0;
  let sumXIITermPaid = 0;
  let sumStatusPending = 0;

  REGISTER_STATUS_CATEGORIES.forEach((item, idx) => {
    const rowNum = statusStartRow + idx;
    const statusLabel = sanitizeSpreadsheetCellText(
      getStatusDisplayLabel(headerConfig, item.category)
    );

    const xiMatching = classXIRows.filter(
      (r) =>
        sanitizeSpreadsheetCellText(
          getStatusDisplayLabel(headerConfig, r.registerCategory)
        ) === statusLabel
    );
    const xiiMatching = classXIIRows.filter(
      (r) =>
        sanitizeSpreadsheetCellText(
          getStatusDisplayLabel(headerConfig, r.registerCategory)
        ) === statusLabel
    );

    const xiCnt = xiMatching.length;
    const xiiCnt = xiiMatching.length;
    const totCnt = xiCnt + xiiCnt;
    const xiPaidAmt =
      xiMatching.reduce((s, r) => s + r.student.paidClassXI, 0) +
      xiiMatching.reduce((s, r) => s + r.student.paidClassXI, 0);
    const xiiPaidAmt =
      xiMatching.reduce((s, r) => s + r.student.paidClassXII, 0) +
      xiiMatching.reduce((s, r) => s + r.student.paidClassXII, 0);
    const totPaidAmt = xiPaidAmt + xiiPaidAmt;
    const totPendAmt =
      xiMatching.reduce((s, r) => s + r.totalPendingIntegrated, 0) +
      xiiMatching.reduce((s, r) => s + r.totalPendingIntegrated, 0);
    const sharePct =
      grandTotalStudents > 0 ? totCnt / grandTotalStudents : 0;

    sumXIStatusCount += xiCnt;
    sumXIIStatusCount += xiiCnt;
    sumXITermPaid += xiPaidAmt;
    sumXIITermPaid += xiiPaidAmt;
    sumStatusPending += totPendAmt;

    const classification =
      item.category === 'Admission Cancelled'
        ? 'Cancelled'
        : item.category === 'Full Paid' ||
          item.category === 'Direct XII Paid' ||
          item.category === 'Only XI Paid'
        ? 'Paid'
        : 'Unpaid / Pending';

    const xiTermFormulaParts: string[] = [];
    if (hasXI) {
      xiTermFormulaParts.push(
        `SUMIF('Class XI'!$M$5:$M$${xiEnd},A${rowNum},'Class XI'!$H$5:$H$${xiEnd})`
      );
    }
    if (hasXII) {
      xiTermFormulaParts.push(
        `SUMIF('Class XII'!$M$5:$M$${xiiEnd},A${rowNum},'Class XII'!$H$5:$H$${xiiEnd})`
      );
    }

    const xiiTermFormulaParts: string[] = [];
    if (hasXI) {
      xiiTermFormulaParts.push(
        `SUMIF('Class XI'!$M$5:$M$${xiEnd},A${rowNum},'Class XI'!$J$5:$J$${xiEnd})`
      );
    }
    if (hasXII) {
      xiiTermFormulaParts.push(
        `SUMIF('Class XII'!$M$5:$M$${xiiEnd},A${rowNum},'Class XII'!$J$5:$J$${xiiEnd})`
      );
    }

    const pendingFormulaParts: string[] = [];
    if (hasXI) {
      pendingFormulaParts.push(
        `SUMIF('Class XI'!$M$5:$M$${xiEnd},A${rowNum},'Class XI'!$L$5:$L$${xiEnd})`
      );
    }
    if (hasXII) {
      pendingFormulaParts.push(
        `SUMIF('Class XII'!$M$5:$M$${xiiEnd},A${rowNum},'Class XII'!$L$5:$L$${xiiEnd})`
      );
    }

    const r = sheet.getRow(rowNum);
    r.height = 22;

    const rowCells: ExcelJS.CellValue[] = [
      statusLabel,
      hasXI
        ? {
            formula: `COUNTIF('Class XI'!$M$5:$M$${xiEnd},A${rowNum})`,
            result: xiCnt,
          }
        : 0,
      hasXII
        ? {
            formula: `COUNTIF('Class XII'!$M$5:$M$${xiiEnd},A${rowNum})`,
            result: xiiCnt,
          }
        : 0,
      { formula: `B${rowNum}+C${rowNum}`, result: totCnt },
      xiTermFormulaParts.length > 0
        ? { formula: xiTermFormulaParts.join('+'), result: xiPaidAmt }
        : 0,
      xiiTermFormulaParts.length > 0
        ? { formula: xiiTermFormulaParts.join('+'), result: xiiPaidAmt }
        : 0,
      { formula: `E${rowNum}+F${rowNum}`, result: totPaidAmt },
      pendingFormulaParts.length > 0
        ? { formula: pendingFormulaParts.join('+'), result: totPendAmt }
        : 0,
      {
        formula: `IF($D$${statusTotalRow}>0,D${rowNum}/$D$${statusTotalRow},0)`,
        result: sharePct,
      },
      classification,
    ];

    const isZebra = idx % 2 === 1;

    rowCells.forEach((val, colIdx) => {
      const cell = r.getCell(colIdx + 1);
      cell.value = val;
      cell.border = THIN_BORDER;
      if (isZebra) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }

      if (colIdx === 0) {
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: true,
          color: { argb: getStatusFontColor(statusLabel) },
        };
      } else if (colIdx >= 1 && colIdx <= 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.numFmt = '#,##0';
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: colIdx === 3,
          color: { argb: 'FF131B2E' },
        };
      } else if (colIdx >= 4 && colIdx <= 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = INR_NUM_FMT;
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: colIdx === 6,
          color: {
            argb:
              colIdx === 6
                ? 'FF006C49'
                : colIdx === 7 && totPendAmt > 0
                ? 'FFBA1A1A'
                : 'FF131B2E',
          },
        };
      } else if (colIdx === 8) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.numFmt = PCT_NUM_FMT;
        cell.font = {
          name: 'Calibri',
          size: 10,
          color: { argb: 'FF334155' },
        };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: true,
          color: {
            argb:
              classification === 'Paid'
                ? 'FF006C49'
                : classification === 'Cancelled'
                ? 'FF64748B'
                : 'FFBA1A1A',
          },
        };
      }
    });
  });

  // Section 2 TOTAL row
  const s2TotalRow = sheet.getRow(statusTotalRow);
  s2TotalRow.height = 25;
  const s2LastDataRow = statusTotalRow - 1;
  const s2TotalValues: ExcelJS.CellValue[] = [
    'TOTAL (ALL CATEGORIES)',
    {
      formula: `SUM(B${statusStartRow}:B${s2LastDataRow})`,
      result: sumXIStatusCount,
    },
    {
      formula: `SUM(C${statusStartRow}:C${s2LastDataRow})`,
      result: sumXIIStatusCount,
    },
    {
      formula: `SUM(D${statusStartRow}:D${s2LastDataRow})`,
      result: sumXIStatusCount + sumXIIStatusCount,
    },
    {
      formula: `SUM(E${statusStartRow}:E${s2LastDataRow})`,
      result: sumXITermPaid,
    },
    {
      formula: `SUM(F${statusStartRow}:F${s2LastDataRow})`,
      result: sumXIITermPaid,
    },
    {
      formula: `SUM(G${statusStartRow}:G${s2LastDataRow})`,
      result: sumXITermPaid + sumXIITermPaid,
    },
    {
      formula: `SUM(H${statusStartRow}:H${s2LastDataRow})`,
      result: sumStatusPending,
    },
    {
      formula: `SUM(I${statusStartRow}:I${s2LastDataRow})`,
      result: grandTotalStudents > 0 ? 1 : 0,
    },
    '100% Verified',
  ];

  s2TotalValues.forEach((val, idx) => {
    const cell = s2TotalRow.getCell(idx + 1);
    cell.value = val;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F7EF' },
    };
    cell.border = TOTAL_BORDER;
    if (idx === 0) {
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      cell.font = {
        name: 'Calibri',
        size: 10.5,
        bold: true,
        color: { argb: 'FF131B2E' },
      };
    } else if (idx >= 1 && idx <= 3) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.numFmt = '#,##0';
      cell.font = {
        name: 'Calibri',
        size: 10.5,
        bold: true,
        color: { argb: 'FF131B2E' },
      };
    } else if (idx >= 4 && idx <= 7) {
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.numFmt = INR_NUM_FMT;
      cell.font = {
        name: 'Calibri',
        size: 10.5,
        bold: true,
        color: {
          argb:
            idx === 6
              ? 'FF006C49'
              : idx === 7
              ? 'FFBA1A1A'
              : 'FF131B2E',
        },
      };
    } else if (idx === 8) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.numFmt = PCT_NUM_FMT;
      cell.font = {
        name: 'Calibri',
        size: 10.5,
        bold: true,
        color: { argb: 'FF005C55' },
      };
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: { argb: 'FF005C55' },
      };
    }
  });

  // Generous balanced column widths for A4 Landscape printing (no truncation)
  const consolidatedWidths = [26, 15, 15, 15, 18, 18, 19, 19, 18, 17];
  consolidatedWidths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  sheet.views = [{ state: 'frozen', ySplit: 5, showGridLines: true }];
  applyStandardPageSetup(sheet, schoolName);
}

/**
 * Pure workbook builder for Reports Excel export:
 *  - Sheet 1: "Consolidated" (100% formula-based Total/Paid/Unpaid counts & financial summary)
 *  - Sheet 2: "Class XI" (exact 13 columns from user specification, ready-to-print A4 Landscape)
 *  - Sheet 3: "Class XII" (exact 13 columns from user specification, ready-to-print A4 Landscape)
 */
export async function buildReportsExcelWorkbook(
  rows: StudentInAcademicYearView[],
  selectedAY: string,
  options?: ReportExcelExportOptions
): Promise<ExcelJS.Workbook> {
  const headerConfig =
    options?.headerConfig ||
    buildDefaultHeaderConfig(['2025-26', '2026-27', '2027-28']);
  const schoolName =
    options?.schoolDisplayName ||
    DEFAULT_FEE_STRUCTURE_SETTINGS.schoolDisplayName;

  const classXIRows = rows.filter((r) => r.activeClassInSelectedAY === 'XI');
  const classXIIRows = rows.filter((r) => r.activeClassInSelectedAY === 'XII');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = schoolName;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const consolidatedSheet = workbook.addWorksheet('Consolidated', {
    properties: { tabColor: { argb: 'FF131B2E' } },
  });
  const classXISheet = workbook.addWorksheet('Class XI', {
    properties: { tabColor: { argb: 'FF005C55' } },
  });
  const classXIISheet = workbook.addWorksheet('Class XII', {
    properties: { tabColor: { argb: 'FF0F766E' } },
  });

  populateClassRegisterSheet(
    classXISheet,
    'Class XI',
    classXIRows,
    selectedAY,
    headerConfig,
    schoolName
  );
  populateClassRegisterSheet(
    classXIISheet,
    'Class XII',
    classXIIRows,
    selectedAY,
    headerConfig,
    schoolName
  );
  populateConsolidatedSheet(
    consolidatedSheet,
    classXIRows,
    classXIIRows,
    selectedAY,
    headerConfig,
    schoolName
  );

  return workbook;
}

/**
 * Downloads the styled, formula-based, ready-to-print 3-sheet Excel report (.xlsx).
 */
export async function exportFormattedReportToExcel(
  rows: StudentInAcademicYearView[],
  selectedAY: string,
  options?: ReportExcelExportOptions
): Promise<void> {
  const workbook = await buildReportsExcelWorkbook(rows, selectedAY, options);
  const safeScope =
    selectedAY === 'ALL_BATCHES'
      ? 'All_Batches'
      : `AY_${sanitizeDownloadFilenamePart(selectedAY, 'Session')}`;
  const dateStamp = new Date().toISOString().slice(0, 10);
  await triggerWorkbookDownload(
    workbook,
    `Integrated_Fee_Report_${safeScope}_${dateStamp}.xlsx`
  );
}

/**
 * Exports student fee ledger rows to the formatted, print-ready 3-sheet .xlsx report workbook.
 */
export async function exportCollectFeeToExcel(
  rows: StudentInAcademicYearView[],
  selectedAY: string,
  options?: ReportExcelExportOptions
): Promise<void> {
  return exportFormattedReportToExcel(rows, selectedAY, options);
}

function appendStyledTableSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
  colWidths: number[]
) {
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  const headerRow = sheet.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF005C55' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = HEADER_BORDER;
  });

  rows.forEach((r, idx) => {
    const dataRow = sheet.addRow(r);
    dataRow.height = 20;
    dataRow.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF131B2E' } };
      if (idx % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
    });
  });

  colWidths.forEach((w, idx) => {
    sheet.getColumn(idx + 1).width = w;
  });
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }];
}

/**
 * Exports the Daily Cashbook & Mode-Wise Reconciliation sheet to a 2-tab .xlsx workbook using ExcelJS.
 */
export async function exportCashbookToExcel(
  summary: CashbookSummary,
  rangeLabel: string
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  wb.modified = new Date();

  const modeHeaders = [
    'Payment Mode',
    'Receipt Count',
    'Tuition Collected (INR)',
    'Late Fine Collected (INR)',
    'Grand Total (INR)',
  ];
  const modeRows: (string | number)[][] = summary.byMode.map((m) => [
    sanitizeSpreadsheetCellText(m.mode),
    m.count,
    m.tuitionTotal,
    m.fineTotal,
    m.grandTotal,
  ]);
  modeRows.push([
    'TOTAL (ACTIVE)',
    summary.activeCount,
    summary.tuitionTotal,
    summary.fineTotal,
    summary.grandTotal,
  ]);
  appendStyledTableSheet(wb, 'Mode_Wise_Summary', modeHeaders, modeRows, [
    22, 16, 22, 22, 22,
  ]);

  const receiptHeaders = [
    'Sr. No.',
    'Payment Date',
    'Receipt No.',
    'EC No.',
    'Student Name',
    'Batch',
    'Allocated XI (INR)',
    'Allocated XII (INR)',
    'Tuition Paid (INR)',
    'Late Fine (INR)',
    'Total Received (INR)',
    'Mode',
    'Reference / UTR',
    'Particular',
  ];
  const receiptRows: (string | number)[][] =
    summary.matchingActiveReceipts.length > 0
      ? summary.matchingActiveReceipts.map((r, idx) => [
          idx + 1,
          sanitizeSpreadsheetCellText(r.paymentDate),
          sanitizeSpreadsheetCellText(r.receiptNo),
          sanitizeSpreadsheetCellText(r.rollNo),
          sanitizeSpreadsheetCellText(r.studentName),
          sanitizeSpreadsheetCellText(r.enrollmentAY),
          r.allocatedToXI,
          r.allocatedToXII,
          r.amount,
          r.fineAmount || 0,
          r.amount + (r.fineAmount || 0),
          sanitizeSpreadsheetCellText(r.paymentMode),
          sanitizeSpreadsheetCellText(r.referenceNo || '-'),
          sanitizeSpreadsheetCellText(r.installmentLabel),
        ])
      : [['', 'No active receipts in selected date range']];

  appendStyledTableSheet(wb, 'Receipt_Register', receiptHeaders, receiptRows, [
    9, 14, 18, 14, 28, 14, 16, 16, 16, 14, 18, 13, 20, 26,
  ]);

  const safeLabel = sanitizeDownloadFilenamePart(rangeLabel, 'All_Time');
  await triggerWorkbookDownload(wb, `SciFee_Cashbook_${safeLabel}.xlsx`);
}

/**
 * Downloads a sample .xlsx Excel template for importing students into a Batch using ExcelJS.
 */
export async function downloadStudentImportExcelTemplate(
  defaultBatchAY = '2026-27',
  defaultXIFee = 10000,
  defaultXIIFee = 10000
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const headers = [
    'EC No.',
    'Student Name',
    'Father Name',
    'Mobile',
    'Admission Batch (A.Y.)',
    'Admission Class',
    'Class XI Fee',
    'Class XI Paid',
    'XI Payment Date',
    'Class XII Fee',
    'Class XII Paid',
    'XII Payment Date',
    'Scholarship Discount',
    'Remark',
  ];
  const sampleRows: (string | number)[][] = [
    [
      '00013201',
      'Aarav Rajesh Sharma',
      'Rajesh Sharma',
      '9820155101',
      defaultBatchAY,
      'XI',
      defaultXIFee,
      defaultXIFee,
      '10/06/2026',
      defaultXIIFee,
      0,
      '-',
      0,
      'Only XI Paid',
    ],
    [
      '00013202',
      'Sneha Pramod Kulkarni',
      'Pramod Kulkarni',
      '9820155102',
      defaultBatchAY,
      'XI',
      defaultXIFee,
      defaultXIFee,
      '12/06/2026',
      defaultXIIFee,
      defaultXIIFee,
      '12/06/2026',
      0,
      'Full Paid',
    ],
  ];

  appendStyledTableSheet(wb, 'Student_Import_Template', headers, sampleRows, [
    14, 26, 22, 15, 22, 16, 14, 14, 16, 14, 14, 16, 18, 18,
  ]);

  const safeAY = sanitizeDownloadFilenamePart(defaultBatchAY, 'Batch');
  await triggerWorkbookDownload(wb, `SciFee_Import_Template_${safeAY}.xlsx`);
}

/**
 * Linear-time RFC-4180 CSV parser (immune to ReDoS & prototype pollution).
 */
export function parseSafeCsvRows(csvText: string): Record<string, string>[] {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const matrix: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i += 1) {
    const ch = cleanText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleanText[i + 1] === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (ch === '\r') {
      if (cleanText[i + 1] === '\n') i += 1;
      currentRow.push(currentCell);
      matrix.push(currentRow);
      currentRow = [];
      currentCell = '';
      if (matrix.length > MAX_IMPORT_STUDENT_ROWS + 1) break;
    } else if (ch === '\n') {
      currentRow.push(currentCell);
      matrix.push(currentRow);
      currentRow = [];
      currentCell = '';
      if (matrix.length > MAX_IMPORT_STUDENT_ROWS + 1) break;
    } else {
      currentCell += ch;
    }
  }
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    matrix.push(currentRow);
  }

  if (matrix.length < 2) return [];
  const rawHeaders = matrix[0].map((h) => h.trim());
  const blocked = new Set(['__proto__', 'constructor', 'prototype']);
  const records: Record<string, string>[] = [];

  for (let r = 1; r < matrix.length && records.length < MAX_IMPORT_STUDENT_ROWS; r += 1) {
    const row = matrix[r];
    if (!row || row.every((c) => !c.trim())) continue;
    const obj: Record<string, string> = Object.create(null);
    rawHeaders.forEach((h, cIdx) => {
      if (!h || blocked.has(h.toLowerCase())) return;
      obj[h] = (row[cIdx] ?? '').trim();
    });
    records.push(obj);
  }
  return records;
}

function extractExcelCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const yyyy = value.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined && value.result !== null) {
      return extractExcelCellText(value.result as ExcelJS.CellValue);
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('').trim();
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text.trim();
    }
  }
  return '';
}

/**
 * Pure row mapper converting parsed spreadsheet records into sanitized StudentRecord payloads.
 * Enforces row caps and full BlueprintConstraints sanitization.
 */
export function parseStudentRowsFromRecords(
  jsonRows: Record<string, unknown>[],
  fallbackBatchAY: string,
  startingSequence: number,
  defaultXIFee = 10000,
  defaultXIIFee = 10000
): Omit<StudentRecord, 'createdAt' | 'updatedAt'>[] {
  const parsedStudents: Omit<StudentRecord, 'createdAt' | 'updatedAt'>[] = [];
  const blockedKeys = new Set(['__proto__', 'constructor', 'prototype']);
  const boundedRows = jsonRows.slice(0, MAX_IMPORT_STUDENT_ROWS);

  boundedRows.forEach((row, idx) => {
    const norm: Record<string, string> = Object.create(null);
    Object.keys(row).forEach((k) => {
      const lower = k.toLowerCase().trim();
      if (!lower || blockedKeys.has(lower)) return;
      norm[lower] = String(row[k] ?? '').trim();
    });

    const fullName =
      norm['student name'] ||
      norm['name'] ||
      norm['full name'] ||
      norm['student'] ||
      '';

    if (
      !fullName ||
      fullName.toLowerCase() === 'student name' ||
      fullName.toLowerCase() === 'total' ||
      fullName.toLowerCase().startsWith('total (')
    ) {
      return;
    }

    const rawEcNo =
      norm['ec no.'] ||
      norm['ec no'] ||
      norm['roll no'] ||
      norm['roll no.'] ||
      norm['sr. no.'] ||
      norm['sr no'] ||
      '';

    const cleanRollNo = rawEcNo
      ? rawEcNo.trim().slice(0, 40)
      : `00013${String(startingSequence + idx).padStart(3, '0')}`;

    let fatherName =
      norm['father name'] || norm['father'] || norm['parent name'] || '';
    if (!fatherName) {
      const nameParts = fullName.replace(/\s+/g, ' ').split(' ');
      fatherName =
        nameParts.length >= 3
          ? nameParts.slice(1).join(' ')
          : nameParts.length === 2
          ? nameParts[1]
          : fullName;
    }

    // Do NOT fabricate fake parent phone numbers if blank in Excel
    const rawPhone =
      norm['mobile'] || norm['phone'] || norm['contact'] || norm['mobile no'] || '';
    const phone =
      rawPhone.toLowerCase() === 'missing' || rawPhone === '-' ? '' : rawPhone;

    const rawBatch =
      norm['admission batch (a.y.)'] ||
      norm['admission batch'] ||
      norm['batch'] ||
      norm['academic year'] ||
      fallbackBatchAY;

    const ayMatch = rawBatch.match(/(\d{4}-\d{2,4})/);
    const enrollmentAY = ayMatch ? ayMatch[1] : fallbackBatchAY;
    const progressionAY = getNextAcademicYear(enrollmentAY);

    const rawAdmClass = (
      norm['admission class'] ||
      norm['class'] ||
      'XI'
    ).toUpperCase();
    const admissionClass = rawAdmClass.includes('XII') ? 'XII' : 'XI';

    const parseMoney = (val: string, fallback: number): number => {
      if (!val || val === '-') return fallback;
      const cleaned = val.replace(/[^0-9.]/g, '');
      const num = Number(cleaned);
      return Number.isFinite(num) ? Math.max(0, Math.round(num)) : fallback;
    };

    const paidClassXI = parseMoney(
      norm['class xi paid'] ||
        norm['xi paid'] ||
        norm['std. xi paid'] ||
        norm['term 1 paid'] ||
        norm['term - i (class xi) paid'] ||
        '',
      0
    );
    const paidClassXII = parseMoney(
      norm['class xii paid'] ||
        norm['xii paid'] ||
        norm['std. xii paid'] ||
        norm['term 2 paid'] ||
        norm['term - ii (class xii) paid'] ||
        '',
      0
    );

    const classXIFee = parseMoney(
      norm['class xi fee'] || norm['xi fee'] || norm['term - i (class xi) fee'] || '',
      admissionClass === 'XII' ? 0 : defaultXIFee
    );
    const classXIIFee = parseMoney(
      norm['class xii fee'] || norm['xii fee'] || norm['term - ii (class xii) fee'] || '',
      defaultXIIFee
    );
    const scholarshipDiscount = parseMoney(
      norm['scholarship discount'] || norm['discount'] || norm['concession'] || '',
      0
    );

    const xiPaymentDate =
      norm['xi payment date'] ||
      norm['xi date'] ||
      (paidClassXI > 0 ? `10/06/${enrollmentAY.slice(0, 4)}` : '-');
    const xiiPaymentDate =
      norm['xii payment date'] ||
      norm['xii date'] ||
      (paidClassXII > 0 ? `10/06/${progressionAY.slice(0, 4)}` : '-');

    const totalIntegratedFee = Math.max(
      0,
      classXIFee + classXIIFee - scholarshipDiscount
    );
    const totalPaid = paidClassXI + paidClassXII;

    const remark =
      norm['remark'] ||
      norm['remarks'] ||
      norm['status'] ||
      norm['fee status / remark'] ||
      (totalPaid >= totalIntegratedFee && totalIntegratedFee > 0
        ? 'Full Paid'
        : paidClassXI > 0
        ? 'Only XI Paid'
        : 'Fee Pending');

    parsedStudents.push(
      sanitizeStudentPayload({
        studentId: `stu_imp_${Date.now()}_${idx}`,
        ownerId: 'local_workspace',
        rollNo: cleanRollNo,
        fullName,
        fatherName,
        phone,
        stream:
          norm['stream'] || norm['section / stream'] || 'Science (Integrated)',
        centerName: `Batch ${enrollmentAY}`,
        enrollmentAY,
        progressionAY,
        admissionClass,
        classXIFee,
        classXIIFee,
        scholarshipDiscount,
        totalIntegratedFee,
        paidClassXI,
        paidClassXII,
        totalPaid,
        xiPaymentDate,
        xiiPaymentDate,
        status: remark === 'Admission Cancelled' ? 'dropped' : 'active',
        remarks: remark,
      })
    );
  });

  return parsedStudents;
}

/**
 * Parses an uploaded Excel (.xlsx) or CSV (.csv) file using ExcelJS / linear-time CSV parser
 * with strict file-size and row-count caps.
 */
export async function parseStudentExcelFile(
  file: File,
  fallbackBatchAY: string,
  startingSequence: number,
  defaultXIFee = 10000,
  defaultXIIFee = 10000
): Promise<Omit<StudentRecord, 'createdAt' | 'updatedAt'>[]> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(
      'Uploaded spreadsheet exceeds the 5 MB safety limit. Please split the file and retry.'
    );
  }

  const lowerName = (file.name || '').toLowerCase();
  if (lowerName.endsWith('.xls')) {
    throw new Error(
      'Legacy .xls binary format is not supported for security reasons. Please save the sheet as .xlsx or .csv and upload again.'
    );
  }

  let jsonRows: Record<string, unknown>[] = [];

  if (lowerName.endsWith('.csv') || file.type === 'text/csv') {
    const csvText = await file.text();
    jsonRows = parseSafeCsvRows(csvText);
  } else {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    // Locate the header row (first row containing "name" / "student" / "ec no" within top 10 rows)
    let headerRowIdx = 1;
    let headers: string[] = [];
    const maxScan = Math.min(10, worksheet.rowCount);
    for (let r = 1; r <= maxScan; r += 1) {
      const row = worksheet.getRow(r);
      const vals: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        vals[colNumber - 1] = extractExcelCellText(cell.value);
      });
      const joined = vals.join(' ').toLowerCase();
      if (
        joined.includes('student name') ||
        joined.includes('full name') ||
        joined.includes('ec no') ||
        vals.some((v) => v.toLowerCase() === 'name')
      ) {
        headerRowIdx = r;
        headers = vals;
        break;
      }
    }

    if (headers.length === 0) {
      const firstRow = worksheet.getRow(1);
      firstRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber - 1] = extractExcelCellText(cell.value);
      });
    }

    const blocked = new Set(['__proto__', 'constructor', 'prototype']);
    const maxRow = Math.min(
      worksheet.rowCount,
      headerRowIdx + MAX_IMPORT_STUDENT_ROWS
    );

    for (let r = headerRowIdx + 1; r <= maxRow; r += 1) {
      const row = worksheet.getRow(r);
      const record: Record<string, string> = Object.create(null);
      let hasData = false;
      headers.forEach((h, idx) => {
        const cleanHeader = (h || '').trim();
        if (!cleanHeader || blocked.has(cleanHeader.toLowerCase())) return;
        const val = extractExcelCellText(row.getCell(idx + 1).value);
        if (val) hasData = true;
        record[cleanHeader] = val;
      });
      if (hasData) {
        jsonRows.push(record);
      }
    }
  }

  return parseStudentRowsFromRecords(
    jsonRows,
    fallbackBatchAY,
    startingSequence,
    defaultXIFee,
    defaultXIIFee
  );
}

/**
 * Downloads a dated full-workspace JSON backup snapshot (students, active + reversed payments, AYs, fee settings).
 */
export function exportWorkspaceBackupJSON(payload: WorkspaceBackupPayload) {
  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], {
    type: 'application/json;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `SciFee_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Pure parser and sanitizer for SciFee JSON workspace backup text.
 * Strips prototype-polluting keys, enforces size/count caps, and sanitizes every student, payment, and setting.
 */
export function parseWorkspaceBackupJSONText(
  text: string
): WorkspaceBackupPayload {
  if (text.length > MAX_IMPORT_FILE_BYTES) {
    throw new Error(
      'Backup JSON exceeds the 5 MB safety limit and cannot be loaded.'
    );
  }

  let parsed: unknown;
  try {
    parsed = safeJsonParse(text);
  } catch {
    throw new Error('Invalid JSON file. Please select a valid SciFee backup file.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Backup file structure is invalid.');
  }

  const obj = parsed as Partial<WorkspaceBackupPayload>;
  if (!Array.isArray(obj.students) || obj.students.length === 0) {
    throw new Error('Backup file does not contain any student ledgers.');
  }
  if (!Array.isArray(obj.payments)) {
    throw new Error('Backup file is missing payment records array.');
  }
  if (obj.students.length > MAX_IMPORT_STUDENT_ROWS) {
    throw new Error(
      `Backup exceeds the maximum supported limit of ${MAX_IMPORT_STUDENT_ROWS} students.`
    );
  }
  if (obj.payments.length > MAX_BACKUP_PAYMENT_ROWS) {
    throw new Error(
      `Backup exceeds the maximum supported limit of ${MAX_BACKUP_PAYMENT_ROWS} payment records.`
    );
  }

  const validAYs = Array.isArray(obj.availableAYs)
    ? Array.from(
        new Set(
          obj.availableAYs.filter(
            (ay): ay is string =>
              typeof ay === 'string' && /^\d{4}-\d{2,4}$/.test(ay)
          )
        )
      ).slice(0, 50)
    : ['2025-26', '2026-27', '2027-28', '2028-29'];
  const finalAYs =
    validAYs.length > 0 ? validAYs : ['2025-26', '2026-27', '2027-28', '2028-29'];

  const rawSchoolName =
    typeof obj.feeSettings?.schoolDisplayName === 'string'
      ? obj.feeSettings.schoolDisplayName
          .replace(/[\x00-\x1F\x7F]/g, '')
          .trim()
          .slice(0, 100)
      : '';
  const rawPrefix =
    typeof obj.feeSettings?.receiptPrefix === 'string'
      ? obj.feeSettings.receiptPrefix
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase()
          .slice(0, 8)
      : '';

  const feeSettings: FeeStructureSettings = {
    schoolDisplayName:
      rawSchoolName || DEFAULT_FEE_STRUCTURE_SETTINGS.schoolDisplayName,
    classXIDefaultFee: Math.min(
      10000000,
      Math.max(
        0,
        Math.round(
          Number(obj.feeSettings?.classXIDefaultFee) ||
            DEFAULT_FEE_STRUCTURE_SETTINGS.classXIDefaultFee
        )
      )
    ),
    classXIIDefaultFee: Math.min(
      10000000,
      Math.max(
        0,
        Math.round(
          Number(obj.feeSettings?.classXIIDefaultFee) ||
            DEFAULT_FEE_STRUCTURE_SETTINGS.classXIIDefaultFee
        )
      )
    ),
    receiptPrefix: rawPrefix || DEFAULT_FEE_STRUCTURE_SETTINGS.receiptPrefix,
  };

  const sanitizedStudents: StudentRecord[] = (obj.students as unknown[])
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object' && !Array.isArray(item))
    )
    .map((item) => sanitizeStudentPayload(item));

  if (sanitizedStudents.length === 0) {
    throw new Error('Backup file does not contain any valid student records.');
  }

  const sanitizedPayments: PaymentRecord[] = (obj.payments as unknown[])
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object' && !Array.isArray(item))
    )
    .map((item) => sanitizePaymentPayload(item));

  const normalizedHeaders = obj.headerConfig
    ? normalizeHeaderConfig(obj.headerConfig, finalAYs)
    : undefined;

  return {
    version: Math.max(1, Math.min(99, Math.round(Number(obj.version) || 1))),
    exportedAt:
      typeof obj.exportedAt === 'string'
        ? obj.exportedAt.slice(0, 40)
        : new Date().toISOString(),
    availableAYs: finalAYs,
    feeSettings,
    headerConfig: normalizedHeaders,
    students: sanitizedStudents,
    payments: sanitizedPayments,
  };
}

/**
 * Parses and validates an uploaded SciFee JSON workspace backup file.
 */
export async function parseWorkspaceBackupJSON(
  file: File
): Promise<WorkspaceBackupPayload> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(
      'Backup JSON file exceeds the 5 MB safety limit and cannot be loaded.'
    );
  }
  const text = await file.text();
  return parseWorkspaceBackupJSONText(text);
}

/**
 * Exports Daily Collection Analytics report (Summary + Detailed Receipts) to Excel using ExcelJS.
 */
export async function exportPeriodCollectionToExcel(
  report: PeriodCollectionReport,
  scopeLabel: string
): Promise<void> {
  const periodTitle =
    report.period.charAt(0).toUpperCase() + report.period.slice(1);
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  wb.modified = new Date();

  const summaryHeaders = [
    'Sr. No.',
    'Period',
    'Details',
    'Receipts',
    'Students',
    '1st Year (XI) INR',
    '2nd Year (XII) INR',
    'Tuition INR',
    'Late Fine INR',
    'Total Collected INR',
    'UPI INR',
    'Cash INR',
    'NEFT/RTGS INR',
    'Cheque INR',
    'Card INR',
    'DD INR',
  ];
  const summaryRows: (string | number)[][] = report.buckets.map((b, idx) => [
    idx + 1,
    sanitizeSpreadsheetCellText(b.label),
    sanitizeSpreadsheetCellText(b.sublabel),
    b.receiptCount,
    b.uniqueStudentCount,
    b.xiTotal,
    b.xiiTotal,
    b.tuitionTotal,
    b.fineTotal,
    b.grandTotal,
    b.byMode.UPI,
    b.byMode.Cash,
    b.byMode['NEFT/RTGS'],
    b.byMode.Cheque,
    b.byMode.Card,
    b.byMode.DD,
  ]);
  summaryRows.push([
    report.buckets.length + 1,
    'GRAND TOTAL',
    sanitizeSpreadsheetCellText(scopeLabel),
    report.totalReceipts,
    report.totalUniqueStudents,
    report.xiTotal,
    report.xiiTotal,
    report.tuitionTotal,
    report.fineTotal,
    report.grandTotal,
    report.byMode.UPI,
    report.byMode.Cash,
    report.byMode['NEFT/RTGS'],
    report.byMode.Cheque,
    report.byMode.Card,
    report.byMode.DD,
  ]);

  appendStyledTableSheet(wb, `${periodTitle} Summary`, summaryHeaders, summaryRows, [
    9, 24, 20, 11, 11, 16, 16, 15, 14, 18, 13, 13, 14, 12, 12, 12,
  ]);

  const receiptsHeaders = [
    'Sr. No.',
    'Payment Date',
    'Receipt No.',
    'Student Name',
    'EC No.',
    'Batch',
    'Recorded In A.Y.',
    '1st Year (XI) INR',
    '2nd Year (XII) INR',
    'Tuition INR',
    'Late Fine INR',
    'Total INR',
    'Mode',
    'Reference',
  ];
  const receiptsRows: (string | number)[][] = report.allMatchingReceipts.map(
    (r, idx) => [
      idx + 1,
      sanitizeSpreadsheetCellText(r.paymentDate),
      sanitizeSpreadsheetCellText(r.receiptNo),
      sanitizeSpreadsheetCellText(r.studentName),
      sanitizeSpreadsheetCellText(r.rollNo),
      sanitizeSpreadsheetCellText(`Batch ${r.enrollmentAY}`),
      sanitizeSpreadsheetCellText(r.recordedInAY),
      r.allocatedToXI,
      r.allocatedToXII,
      r.amount,
      Math.max(0, Number(r.fineAmount) || 0),
      r.amount + Math.max(0, Number(r.fineAmount) || 0),
      sanitizeSpreadsheetCellText(r.paymentMode),
      sanitizeSpreadsheetCellText(r.referenceNo || '-'),
    ]
  );

  appendStyledTableSheet(wb, 'Receipts Breakdown', receiptsHeaders, receiptsRows, [
    9, 14, 18, 26, 14, 15, 15, 15, 15, 14, 13, 14, 12, 18,
  ]);

  const safeScope = sanitizeDownloadFilenamePart(scopeLabel, 'All');
  const dateStamp = new Date().toISOString().slice(0, 10);
  await triggerWorkbookDownload(
    wb,
    `SciFee_${periodTitle}_Collection_${safeScope}_${dateStamp}.xlsx`
  );
}


