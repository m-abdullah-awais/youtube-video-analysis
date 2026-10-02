import * as XLSX from "xlsx";
import { parseCsv, serializeCsv, setCsvCell } from "./csv";

export type SheetFormat = "csv" | "xlsx" | "xls";

export type TableRow = {
  /** 0-based row index in the sheet (or CSV line), used to write back. */
  sheetRow: number;
  cells: string[];
  /** Hyperlink targets behind cells, when the file has them. */
  links: (string | undefined)[];
};

export type Table = {
  format: SheetFormat;
  sheetNames: string[];
  sheetName: string;
  headerRow: number;
  headers: string[];
  rows: TableRow[];
};

export type ColumnWrite = {
  sheetName?: string;
  column: number;
  /** Header text to write when the column is new. */
  header?: { row: number; text: string };
  /** Text keyed by sheet row. */
  values: Map<number, string>;
};

const EXCEL_CELL_LIMIT = 32767;

export function detectFormat(filename: string): SheetFormat {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "xlsx" || ext === "xls") return ext;
  throw new Error("Upload a CSV or Excel file (.csv, .xlsx or .xls).");
}

export function readTable(data: Uint8Array, filename: string, sheetName?: string): Table {
  const format = detectFormat(filename);
  return format === "csv" ? readCsvTable(data) : readExcelTable(data, format, sheetName);
}

export function writeColumn(data: Uint8Array, filename: string, write: ColumnWrite): Uint8Array {
  const format = detectFormat(filename);
  return format === "csv" ? writeCsvColumn(data, write) : writeExcelColumn(data, format, write);
}

function readCsvTable(data: Uint8Array): Table {
  const doc = parseCsv(decodeText(data));
  const grid = doc.rows.map((cells) => ({ cells, links: [] as (string | undefined)[] }));
  return { format: "csv", sheetNames: ["CSV"], sheetName: "CSV", ...toTable(grid) };
}

function writeCsvColumn(data: Uint8Array, write: ColumnWrite): Uint8Array {
  const doc = parseCsv(decodeText(data));
  if (write.header) setCsvCell(doc, write.header.row, write.column, write.header.text);
  for (const [row, text] of write.values) setCsvCell(doc, row, write.column, text);
  return new TextEncoder().encode(serializeCsv(doc));
}

function readExcelTable(data: Uint8Array, format: SheetFormat, sheetName?: string): Table {
  const wb = XLSX.read(data, { type: "array" });
  const name = sheetName ?? wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`The sheet "${sheetName}" was not found in this file.`);

  const grid: { cells: string[]; links: (string | undefined)[] }[] = [];
  if (ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let r = 0; r <= range.e.r; r++) {
      const cells: string[] = [];
      const links: (string | undefined)[] = [];
      for (let c = 0; c <= range.e.c; c++) {
        const cell: XLSX.CellObject | undefined = ws[XLSX.utils.encode_cell({ r, c })];
        cells.push(cell ? String(cell.w ?? cell.v ?? "") : "");
        links.push(cell?.l?.Target);
      }
      grid.push({ cells, links });
    }
  }
  return { format, sheetNames: wb.SheetNames, sheetName: name, ...toTable(grid) };
}

function writeExcelColumn(data: Uint8Array, format: SheetFormat, write: ColumnWrite): Uint8Array {
  const wb = XLSX.read(data, { type: "array", cellStyles: true, cellFormula: true, cellNF: true });
  const name = write.sheetName ?? wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`The sheet "${name}" was not found in this file.`);

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  const put = (r: number, text: string) => {
    ws[XLSX.utils.encode_cell({ r, c: write.column })] = { t: "s", v: text.slice(0, EXCEL_CELL_LIMIT) };
    range.e.r = Math.max(range.e.r, r);
    range.e.c = Math.max(range.e.c, write.column);
  };
  if (write.header) put(write.header.row, write.header.text);
  for (const [row, text] of write.values) put(row, text);
  ws["!ref"] = XLSX.utils.encode_range(range);

  const bookType = format === "xls" ? "biff8" : "xlsx";
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType, cellStyles: true }));
}

/** Uses the first non-empty row as headers and keeps non-empty rows below it. */
function toTable(grid: { cells: string[]; links: (string | undefined)[] }[]) {
  const isEmpty = (cells: string[]) => cells.every((v) => v.trim() === "");
  const headerRow = grid.findIndex((row) => !isEmpty(row.cells));
  if (headerRow === -1) return { headerRow: 0, headers: [], rows: [] };

  const headers = trimTrailingEmpty(grid[headerRow].cells).map((h) => h.trim());
  const rows: TableRow[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    if (!isEmpty(grid[r].cells)) rows.push({ sheetRow: r, ...grid[r] });
  }
  return { headerRow, headers, rows };
}

function trimTrailingEmpty(cells: string[]): string[] {
  let end = cells.length;
  while (end > 0 && cells[end - 1].trim() === "") end--;
  return cells.slice(0, end);
}

/** Keeps a leading BOM so CSV files are written back byte for byte. */
function decodeText(data: Uint8Array): string {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(data);
}
