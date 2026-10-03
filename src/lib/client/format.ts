import type { Messages } from "@/lib/i18n/messages";

/** Spreadsheet column letter for a 0-based index: 0 -> A, 26 -> AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function formatDuration(ms: number, words: Messages["duration"]): string {
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 1) return words.lessThanMinute;
  if (totalMinutes < 60) return words.minutes(totalMinutes);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${words.hours(hours)} ${words.minutes(minutes)}` : words.hours(hours);
}

/** Spreadsheet row number as people see it (1-based). */
export const displayRow = (sheetRow: number) => sheetRow + 1;
