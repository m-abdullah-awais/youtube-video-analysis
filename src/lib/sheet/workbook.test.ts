import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readTable, writeColumn } from "./workbook";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

function makeXlsx(): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [],
    ["Title", "Video", "Views", "Description"],
    ["First", "https://youtu.be/dQw4w9WgXcQ", 1200, ""],
    [],
    ["Second", "Watch here", 50, "Existing text"],
  ]);
  ws["B5"].l = { Target: "https://www.youtube.com/watch?v=aBcDeFgHiJk" };
  ws["E3"] = { t: "n", f: "C3*2" };
  ws["!ref"] = "A1:E5";
  XLSX.utils.book_append_sheet(wb, ws, "Videos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["notes"], ["keep me"]]), "Notes");
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("readTable", () => {
  it("reads CSV headers and data rows with their sheet row numbers", () => {
    const table = readTable(encoder.encode("Title,Video URL\nA,https://youtu.be/dQw4w9WgXcQ\n\nB,x\n"), "videos.csv");
    expect(table.format).toBe("csv");
    expect(table.headerRow).toBe(0);
    expect(table.headers).toEqual(["Title", "Video URL"]);
    expect(table.rows.map((r) => [r.sheetRow, r.cells])).toEqual([
      [1, ["A", "https://youtu.be/dQw4w9WgXcQ"]],
      [3, ["B", "x"]],
    ]);
  });

  it("finds the first non-empty row as the XLSX header and exposes hyperlinks", () => {
    const table = readTable(makeXlsx(), "videos.xlsx");
    expect(table.format).toBe("xlsx");
    expect(table.sheetNames).toEqual(["Videos", "Notes"]);
    expect(table.sheetName).toBe("Videos");
    expect(table.headerRow).toBe(1);
    expect(table.headers.slice(0, 4)).toEqual(["Title", "Video", "Views", "Description"]);
    expect(table.rows.map((r) => r.sheetRow)).toEqual([2, 4]);
    expect(table.rows[0].cells[2]).toBe("1200");
    expect(table.rows[1].links[1]).toBe("https://www.youtube.com/watch?v=aBcDeFgHiJk");
  });

  it("reads a chosen sheet", () => {
    const table = readTable(makeXlsx(), "videos.xlsx", "Notes");
    expect(table.headers).toEqual(["notes"]);
  });

  it("rejects unsupported file types", () => {
    expect(() => readTable(encoder.encode("x"), "videos.pdf")).toThrow(/CSV or Excel/);
  });
});

describe("writeColumn", () => {
  it("writes CSV values into the column and leaves everything else untouched", () => {
    const source = "﻿Title;Video;Description\r\nA;dQw4w9WgXcQ;\r\nB;aBcDeFgHiJk;keep\r\n";
    const out = writeColumn(encoder.encode(source), "v.csv", {
      column: 2,
      values: new Map([[1, "Summary:\nGreat; video"]]),
    });
    expect(decoder.decode(out)).toBe(
      '﻿Title;Video;Description\r\nA;dQw4w9WgXcQ;"Summary:\nGreat; video"\r\nB;aBcDeFgHiJk;keep\r\n',
    );
  });

  it("adds a header when writing a new CSV column", () => {
    const out = writeColumn(encoder.encode("Title,Video\nA,x\n"), "v.csv", {
      column: 2,
      header: { row: 0, text: "Description" },
      values: new Map([[1, "done"]]),
    });
    expect(decoder.decode(out)).toBe("Title,Video,Description\nA,x,done\n");
  });

  it("writes XLSX cells while keeping numbers, formulas, links and other sheets", () => {
    const out = writeColumn(makeXlsx(), "v.xlsx", {
      sheetName: "Videos",
      column: 3,
      values: new Map([
        [2, "First summary"],
        [4, "Second summary"],
      ]),
    });
    const wb = XLSX.read(out, { type: "array", cellFormula: true });
    const ws = wb.Sheets["Videos"];
    expect(ws["D3"].v).toBe("First summary");
    expect(ws["D5"].v).toBe("Second summary");
    expect(ws["C3"]).toMatchObject({ t: "n", v: 1200 });
    expect(ws["E3"].f).toBe("C3*2");
    expect(ws["B5"].l.Target).toBe("https://www.youtube.com/watch?v=aBcDeFgHiJk");
    expect(XLSX.utils.sheet_to_json(wb.Sheets["Notes"], { header: 1 })).toEqual([["notes"], ["keep me"]]);
  });

  it("extends the XLSX range for a new column", () => {
    const out = writeColumn(makeXlsx(), "v.xlsx", {
      sheetName: "Videos",
      column: 6,
      header: { row: 1, text: "Description" },
      values: new Map([[2, "x"]]),
    });
    const ws = XLSX.read(out, { type: "array" }).Sheets["Videos"];
    expect(ws["G2"].v).toBe("Description");
    expect(ws["G3"].v).toBe("x");
    expect(ws["!ref"]).toBe("A1:G5");
  });

  it("caps XLSX cell text at Excel's 32,767 character limit", () => {
    const out = writeColumn(makeXlsx(), "v.xlsx", {
      sheetName: "Videos",
      column: 3,
      values: new Map([[2, "a".repeat(40000)]]),
    });
    const ws = XLSX.read(out, { type: "array" }).Sheets["Videos"];
    expect(String(ws["D3"].v).length).toBe(32767);
  });
});
