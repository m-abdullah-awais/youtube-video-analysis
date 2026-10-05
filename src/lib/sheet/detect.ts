import { parseVideoRef } from "../youtube/video-id";
import type { TableRow } from "./workbook";

export type ColumnGuess = { video: number | null; description: number | null; title: number | null };
export type ColumnMapping = { video: number; description: number | null };
export type RowStatus = "pending" | "filled" | "invalid" | "duplicate" | "excluded";

export type PlannedRow = {
  sheetRow: number;
  source: string;
  videoId: string | null;
  isShort: boolean;
  status: RowStatus;
};

const SAMPLE_SIZE = 50;
const MIN_VIDEO_RATIO = 0.3;
const VIDEO_HEADER = /video|youtube|url|link|\bid\b/i;

/** The value to read a video from: a hyperlink target wins over display text. */
export function videoSource(row: TableRow, column: number): string {
  return row.links[column] ?? row.cells[column] ?? "";
}

export function detectColumns(headers: string[], rows: TableRow[]): ColumnGuess {
  const sample = rows.slice(0, SAMPLE_SIZE);
  const columnCount = Math.max(headers.length, ...sample.map((r) => r.cells.length));

  let video: number | null = null;
  let bestScore = 0;
  for (let c = 0; c < columnCount; c++) {
    const hits = sample.filter((r) => parseVideoRef(videoSource(r, c))).length;
    const ratio = sample.length ? hits / sample.length : 0;
    if (ratio < MIN_VIDEO_RATIO) continue;
    const score = ratio + (VIDEO_HEADER.test(headers[c] ?? "") ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      video = c;
    }
  }

  return {
    video,
    description: findHeader(headers, [/^(video\s*)?description$/i, /desc/i, /summary/i]),
    title: findHeader(headers, [/^(video\s*)?title$/i, /title/i]),
  };
}

/** `include` limits processing to chosen rows; videos in other rows are marked excluded. */
export function planRows(
  rows: TableRow[],
  mapping: ColumnMapping,
  options: { overwrite: boolean; include?: (sheetRow: number) => boolean },
): PlannedRow[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const source = videoSource(row, mapping.video).trim();
    const ref = parseVideoRef(source);
    const base = { sheetRow: row.sheetRow, source, videoId: ref?.id ?? null, isShort: ref?.isShort ?? false };
    if (!ref) return { ...base, status: "invalid" };

    const filled = mapping.description !== null && (row.cells[mapping.description] ?? "").trim() !== "";
    if (filled && !options.overwrite) return { ...base, status: "filled" };
    if (options.include && !options.include(row.sheetRow)) return { ...base, status: "excluded" };
    if (seen.has(ref.id)) return { ...base, status: "duplicate" };
    seen.add(ref.id);
    return { ...base, status: "pending" };
  });
}

function findHeader(headers: string[], patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const index = headers.findIndex((h) => pattern.test(h.trim()));
    if (index !== -1) return index;
  }
  return null;
}
