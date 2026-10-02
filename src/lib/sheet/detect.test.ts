import { describe, expect, it } from "vitest";
import { detectColumns, planRows } from "./detect";
import type { TableRow } from "./workbook";

const row = (sheetRow: number, cells: string[], links: (string | undefined)[] = []): TableRow => ({
  sheetRow,
  cells,
  links,
});

describe("detectColumns", () => {
  it("finds video, description and title columns by header and content", () => {
    const headers = ["Video title", "Published", "Link", "Description"];
    const rows = [
      row(1, ["A", "2024-01-01", "https://youtu.be/dQw4w9WgXcQ", ""]),
      row(2, ["B", "2024-01-02", "https://www.youtube.com/watch?v=aBcDeFgHiJk", ""]),
    ];
    expect(detectColumns(headers, rows)).toEqual({ video: 2, description: 3, title: 0 });
  });

  it("finds the video column from content when the header is unhelpful", () => {
    const headers = ["Name", "Col B"];
    const rows = [row(1, ["A", "dQw4w9WgXcQ"]), row(2, ["B", "aBcDeFgHiJk"])];
    expect(detectColumns(headers, rows).video).toBe(1);
  });

  it("uses hyperlink targets behind display text", () => {
    const headers = ["Name", "Watch"];
    const rows = [row(1, ["A", "Click"], [undefined, "https://youtu.be/dQw4w9WgXcQ"])];
    expect(detectColumns(headers, rows).video).toBe(1);
  });

  it("prefers an exact Description header over a looser match", () => {
    const headers = ["Summary notes", "Video", "Description"];
    expect(detectColumns(headers, [row(1, ["", "dQw4w9WgXcQ", ""])]).description).toBe(2);
  });

  it("falls back to a summary column when no description column exists", () => {
    const headers = ["Video", "Summary"];
    expect(detectColumns(headers, [row(1, ["dQw4w9WgXcQ", ""])]).description).toBe(1);
  });

  it("returns null when nothing matches", () => {
    expect(detectColumns(["a", "b"], [row(1, ["x", "y"])])).toEqual({ video: null, description: null, title: null });
  });
});

describe("planRows", () => {
  const rows = [
    row(1, ["A", "https://youtu.be/dQw4w9WgXcQ", ""]),
    row(2, ["B", "https://youtu.be/aBcDeFgHiJk", "Already written"]),
    row(3, ["C", "not a link", ""]),
    row(4, ["D", "dQw4w9WgXcQ", ""]),
    row(5, ["E", "https://www.youtube.com/shorts/zZzZzZzZzZz", "  "]),
  ];

  it("marks each row as pending, filled, invalid or duplicate", () => {
    const plan = planRows(rows, { video: 1, description: 2 }, { overwrite: false });
    expect(plan.map((p) => [p.sheetRow, p.status, p.videoId, p.isShort])).toEqual([
      [1, "pending", "dQw4w9WgXcQ", false],
      [2, "filled", "aBcDeFgHiJk", false],
      [3, "invalid", null, false],
      [4, "duplicate", "dQw4w9WgXcQ", false],
      [5, "pending", "zZzZzZzZzZz", true],
    ]);
  });

  it("keeps the original link for each row", () => {
    expect(planRows(rows, { video: 1, description: 2 }, { overwrite: false })[0].source).toBe(
      "https://youtu.be/dQw4w9WgXcQ",
    );
  });

  it("queues filled rows when overwrite is on", () => {
    const plan = planRows(rows, { video: 1, description: 2 }, { overwrite: true });
    expect(plan[1].status).toBe("pending");
  });

  it("treats every row as empty when the description column is new", () => {
    const plan = planRows(rows, { video: 1, description: null }, { overwrite: false });
    expect(plan[1].status).toBe("pending");
  });
});
