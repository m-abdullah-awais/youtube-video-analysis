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

const number = new Intl.NumberFormat("en-US");

export const formatNumber = (n: number) => number.format(n);

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

export function formatDate(value: string | number): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: number): string {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 1) return "less than a minute";
  if (totalMinutes < 60) return plural(totalMinutes, "minute");
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${plural(hours, "hour")} ${plural(minutes, "minute")}` : plural(hours, "hour");
}

/** Spreadsheet row number as people see it (1-based). */
export const displayRow = (sheetRow: number) => sheetRow + 1;
