import { describe, expect, it } from "vitest";
import { parseCsv, serializeCsv, setCsvCell } from "./csv";

describe("parseCsv", () => {
  it("reads simple comma-separated rows", () => {
    expect(parseCsv("a,b\n1,2\n").rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields with commas, quotes and line breaks", () => {
    const doc = parseCsv('title,desc\n"Hello, world","She said ""hi""\nnext line"\n');
    expect(doc.rows[1]).toEqual(["Hello, world", 'She said "hi"\nnext line']);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("a;b\n1;2").delimiter).toBe(";");
    expect(parseCsv("a\tb\n1\t2").delimiter).toBe("\t");
    expect(parseCsv("a,b\n1,2").delimiter).toBe(",");
  });

  it("ignores delimiters inside quotes when detecting", () => {
    expect(parseCsv('"a;x",b\n1,2').delimiter).toBe(",");
  });

  it("strips a UTF-8 BOM from the first cell", () => {
    const doc = parseCsv("﻿title,url\nx,y");
    expect(doc.rows[0][0]).toBe("title");
    expect(doc.bom).toBe(true);
  });

  it("returns no rows for empty input", () => {
    expect(parseCsv("").rows).toEqual([]);
  });
});

describe("serializeCsv", () => {
  it.each([
    "a,b\n1,2\n",
    "a,b\r\n1,2\r\n",
    "a,b\n1,2",
    "﻿a;b\r\n\"x;y\";2\r\n",
    'title,desc\n"Hello, world","She said ""hi""\nnext"\n"quoted",plain\n',
    "a,b\n\n1,2\n",
    "a,b,c\n1,,3\n",
  ])("round-trips %j byte for byte", (text) => {
    expect(serializeCsv(parseCsv(text))).toBe(text);
  });
});

describe("setCsvCell", () => {
  it("writes a value and quotes it when needed", () => {
    const doc = parseCsv("title,description\r\nVideo,\r\n");
    setCsvCell(doc, 1, 1, 'Summary:\nLine with "quote", and comma');
    expect(serializeCsv(doc)).toBe('title,description\r\nVideo,"Summary:\nLine with ""quote"", and comma"\r\n');
  });

  it("pads short rows when writing past their end", () => {
    const doc = parseCsv("a,b,c\nx\n");
    setCsvCell(doc, 1, 2, "z");
    expect(serializeCsv(doc)).toBe("a,b,c\nx,,z\n");
  });

  it("uses the file's own delimiter", () => {
    const doc = parseCsv("a;b\n1;\n");
    setCsvCell(doc, 1, 1, "has;semi");
    expect(serializeCsv(doc)).toBe('a;b\n1;"has;semi"\n');
  });
});
