/**
 * Minimal RFC 4180 CSV reader and writer that keeps the file's own
 * delimiter, line endings, BOM and quoting, so untouched cells are
 * written back exactly as they were read.
 */
export type CsvDoc = {
  rows: string[][];
  /** Whether each cell was wrapped in quotes in the source file. */
  quoted: boolean[][];
  delimiter: string;
  eol: "\n" | "\r\n";
  bom: boolean;
  trailingEol: boolean;
};

const BOM = "﻿";
const CANDIDATE_DELIMITERS = [",", ";", "\t", "|"];

export function parseCsv(input: string): CsvDoc {
  const bom = input.startsWith(BOM);
  const text = bom ? input.slice(1) : input;
  const { delimiter, eol } = sniff(text);

  const rows: string[][] = [];
  const quoted: boolean[][] = [];
  let row: string[] = [];
  let rowQuoted: boolean[] = [];
  let field = "";
  let fieldQuoted = false;
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    rowQuoted.push(fieldQuoted);
    field = "";
    fieldQuoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    quoted.push(rowQuoted);
    row = [];
    rowQuoted = [];
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        field += c;
      }
      i++;
    } else if (c === '"' && field === "" && !fieldQuoted) {
      inQuotes = true;
      fieldQuoted = true;
      i++;
    } else if (c === delimiter) {
      endField();
      i++;
    } else if (c === "\n" || (c === "\r" && text[i + 1] === "\n")) {
      endRow();
      i += c === "\r" ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== "" || fieldQuoted || row.length > 0) endRow();

  return { rows, quoted, delimiter, eol, bom, trailingEol: /\n$/.test(text) };
}

export function serializeCsv(doc: CsvDoc): string {
  const lines = doc.rows.map((row, r) =>
    row.map((value, c) => encodeField(value, doc.quoted[r]?.[c] ?? false, doc.delimiter)).join(doc.delimiter),
  );
  const body = lines.join(doc.eol) + (doc.trailingEol && lines.length > 0 ? doc.eol : "");
  return (doc.bom ? BOM : "") + body;
}

export function setCsvCell(doc: CsvDoc, rowIndex: number, colIndex: number, value: string): void {
  while (doc.rows.length <= rowIndex) {
    doc.rows.push([]);
    doc.quoted.push([]);
  }
  const row = doc.rows[rowIndex];
  const rowQuoted = doc.quoted[rowIndex];
  while (row.length <= colIndex) {
    row.push("");
    rowQuoted.push(false);
  }
  row[colIndex] = value;
  rowQuoted[colIndex] = false;
}

function encodeField(value: string, wasQuoted: boolean, delimiter: string): string {
  const needsQuotes = wasQuoted || value.includes(delimiter) || /["\r\n]/.test(value);
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Reads the first record (outside quotes) to pick the delimiter and line ending. */
function sniff(text: string): { delimiter: string; eol: "\n" | "\r\n" } {
  const counts = new Map(CANDIDATE_DELIMITERS.map((d) => [d, 0]));
  let eol: "\n" | "\r\n" = "\n";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c === "\n") {
      if (text[i - 1] === "\r") eol = "\r\n";
      break;
    } else if (!inQuotes && counts.has(c)) counts.set(c, counts.get(c)! + 1);
  }
  let delimiter = ",";
  for (const [d, n] of counts) if (n > counts.get(delimiter)!) delimiter = d;
  return { delimiter, eol };
}
