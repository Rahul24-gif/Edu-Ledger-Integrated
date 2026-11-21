import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  buildReportsExcelWorkbook,
  REPORT_EXCEL_COLUMNS,
} from './excelUtils';
import {
  buildDefaultHeaderConfig,
  createInitialSeedData,
  resolveStudentInAcademicYear,
} from './ledgerLogic';
import { StudentInAcademicYearView } from '../types';

function getFormulaObj(val: ExcelJS.CellValue): {
  formula: string;
  result?: unknown;
} {
  assert.ok(
    val && typeof val === 'object' && 'formula' in val,
    `Expected formula cell object, got: ${JSON.stringify(val)}`
  );
  return val as { formula: string; result?: unknown };
}

test('buildReportsExcelWorkbook produces 3 print-ready sheets (Consolidated, Class XI, Class XII) with exact 13 columns & live formulas', async () => {
  const { students } = createInitialSeedData('test_owner');
  const rows = students
    .map((s) => resolveStudentInAcademicYear(s, '2026-27'))
    .filter((r): r is StudentInAcademicYearView => r !== null);

  const wb = await buildReportsExcelWorkbook(rows, '2026-27', {
    headerConfig: buildDefaultHeaderConfig(['2025-26', '2026-27']),
    schoolDisplayName: 'Science Integrated Academy',
  });

  // Round-trip through real .xlsx binary buffer to prove valid OpenXML output
  const buffer = await wb.xlsx.writeBuffer();
  assert.ok(buffer.byteLength > 5000, 'Generated .xlsx buffer should be non-trivial');

  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);

  // 1. Exact 3 sheets
  assert.deepEqual(
    loaded.worksheets.map((s) => s.name),
    ['Consolidated', 'Class XI', 'Class XII']
  );

  const consolidated = loaded.getWorksheet('Consolidated')!;
  const xiSheet = loaded.getWorksheet('Class XI')!;
  const xiiSheet = loaded.getWorksheet('Class XII')!;

  // 2. Exact 13 column headers on both Class XI and Class XII sheets (no extra columns)
  for (const sheet of [xiSheet, xiiSheet]) {
    assert.equal(
      sheet.columnCount,
      13,
      `${sheet.name} must have exactly 13 columns matching the user reference`
    );
    const headerValues: string[] = [];
    for (let col = 1; col <= 13; col += 1) {
      headerValues.push(String(sheet.getRow(4).getCell(col).value ?? ''));
    }
    assert.deepEqual(headerValues, [...REPORT_EXCEL_COLUMNS]);
  }

  // 3. Exact student counts & live formulas on Class XI (83 rows: 5..87, total row 88) and Class XII (60 rows: 5..64, total row 65)
  const xiTotalRow = xiSheet.getRow(88);
  assert.equal(xiTotalRow.getCell(3).value, 'TOTAL (Class XI)');
  const xiCountFormula = getFormulaObj(xiTotalRow.getCell(2).value);
  assert.equal(xiCountFormula.formula, 'COUNTA(C5:C87)');
  assert.equal(xiCountFormula.result, 83);

  const xiPaidSumFormula = getFormulaObj(xiTotalRow.getCell(11).value);
  assert.equal(xiPaidSumFormula.formula, 'SUM(K5:K87)');

  // Per-row live formula for Total Integrated Paid = H{r}+J{r}
  const xiFirstRowPaid = getFormulaObj(xiSheet.getRow(5).getCell(11).value);
  assert.equal(xiFirstRowPaid.formula, 'H5+J5');

  const xiiTotalRow = xiiSheet.getRow(65);
  assert.equal(xiiTotalRow.getCell(3).value, 'TOTAL (Class XII)');
  const xiiCountFormula = getFormulaObj(xiiTotalRow.getCell(2).value);
  assert.equal(xiiCountFormula.formula, 'COUNTA(C5:C64)');
  assert.equal(xiiCountFormula.result, 60);

  // 4. Consolidated sheet live formulas & reconciliation
  const cXiTotal = getFormulaObj(consolidated.getCell('B6').value);
  assert.equal(cXiTotal.formula, "COUNTA('Class XI'!C5:C87)");
  assert.equal(cXiTotal.result, 83);

  const cXiPaid = getFormulaObj(consolidated.getCell('C6').value);
  assert.ok(cXiPaid.formula.includes("COUNTIFS('Class XI'!H5:H87"));
  const cXiPartial = getFormulaObj(consolidated.getCell('D6').value);
  assert.ok(cXiPartial.formula.includes("COUNTIF('Class XI'!M5:M87"));
  const cXiUnpaid = getFormulaObj(consolidated.getCell('E6').value);
  assert.ok(cXiUnpaid.formula.includes("COUNTIFS('Class XI'!H5:H87,0"));
  const cXiCancelled = getFormulaObj(consolidated.getCell('F6').value);
  assert.ok(cXiCancelled.formula.includes("COUNTIF('Class XI'!M5:M87"));
  const cXiTotalUnpaid = getFormulaObj(consolidated.getCell('G6').value);
  assert.equal(cXiTotalUnpaid.formula, 'D6+E6');

  // Partition completeness for Class XI (both pre-serialization and reloaded): Paid + Partial + Unpaid + Cancelled === Total Students
  const origConsolidated = wb.getWorksheet('Consolidated')!;
  const origXiSum =
    Number(origConsolidated.getCell('C6').result) +
    Number(origConsolidated.getCell('D6').result) +
    Number(origConsolidated.getCell('E6').result) +
    Number(origConsolidated.getCell('F6').result);
  assert.equal(origXiSum, 83);

  assert.equal(
    Number(cXiPaid.result ?? 0) +
      Number(cXiPartial.result ?? 0) +
      Number(cXiUnpaid.result ?? 0) +
      Number(cXiCancelled.result ?? 0),
    Number(cXiTotal.result ?? 0)
  );

  // Class XII partition completeness
  const cXiiTotal = getFormulaObj(consolidated.getCell('B7').value);
  const cXiiPaid = getFormulaObj(consolidated.getCell('C7').value);
  const cXiiPartial = getFormulaObj(consolidated.getCell('D7').value);
  const cXiiUnpaid = getFormulaObj(consolidated.getCell('E7').value);
  const cXiiCancelled = getFormulaObj(consolidated.getCell('F7').value);
  assert.equal(cXiiTotal.result, 60);
  assert.equal(
    Number(cXiiPaid.result ?? 0) +
      Number(cXiiPartial.result ?? 0) +
      Number(cXiiUnpaid.result ?? 0) +
      Number(cXiiCancelled.result ?? 0),
    60
  );

  // Grand Total row (Row 8) live formulas
  const grandTotalStudents = getFormulaObj(consolidated.getCell('B8').value);
  assert.equal(grandTotalStudents.formula, 'SUM(B6:B7)');
  assert.equal(grandTotalStudents.result, 143);

  const grandTotalPaidMoney = getFormulaObj(consolidated.getCell('H8').value);
  assert.equal(grandTotalPaidMoney.formula, 'SUM(H6:H7)');
  assert.equal(grandTotalPaidMoney.result, 1595000);

  const grandTotalPendingMoney = getFormulaObj(consolidated.getCell('I8').value);
  assert.equal(grandTotalPendingMoney.formula, 'SUM(I6:I7)');
  assert.equal(grandTotalPendingMoney.result, 1225000);

  // Status-wise section (Row 12..19, Total Row 20) uses COUNTIF / SUMIF formulas
  const statusTotal = getFormulaObj(consolidated.getCell('D20').value);
  assert.equal(statusTotal.formula, 'SUM(D12:D19)');
  assert.equal(statusTotal.result, 143);

  // 5. Print-Ready A4 Landscape Page Setup & generous column widths on all 3 sheets
  for (const sheet of [consolidated, xiSheet, xiiSheet]) {
    assert.equal(sheet.pageSetup.paperSize, 9, `${sheet.name} must be A4`);
    assert.equal(
      sheet.pageSetup.orientation,
      'landscape',
      `${sheet.name} must be landscape`
    );
    assert.equal(sheet.pageSetup.fitToPage, true);
    assert.equal(sheet.pageSetup.fitToWidth, 1);
    assert.equal(sheet.pageSetup.fitToHeight, 0);
    assert.equal(sheet.pageSetup.horizontalCentered, true);

    // Every column must have explicit generous width so nothing truncates
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const w = sheet.getColumn(c).width ?? 0;
      assert.ok(w >= 8, `${sheet.name} col ${c} width (${w}) should be >= 8`);
    }
  }

  assert.equal(xiSheet.pageSetup.printTitlesRow, '1:4');
  assert.equal(xiiSheet.pageSetup.printTitlesRow, '1:4');
});

test('buildReportsExcelWorkbook handles single-class filtered rows without broken formulas', async () => {
  const { students } = createInitialSeedData('test_owner');
  const xiOnly = students
    .map((s) => resolveStudentInAcademicYear(s, '2026-27'))
    .filter(
      (r): r is StudentInAcademicYearView =>
        r !== null && r.activeClassInSelectedAY === 'XI'
    );

  const wb = await buildReportsExcelWorkbook(xiOnly, '2026-27');
  const buffer = await wb.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);

  const consolidated = loaded.getWorksheet('Consolidated')!;
  assert.equal(consolidated.getCell('B7').value, 0);
  const grandStudents = getFormulaObj(consolidated.getCell('B8').value);
  assert.equal(grandStudents.result, 83);
});
