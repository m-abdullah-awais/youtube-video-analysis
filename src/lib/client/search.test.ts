import { describe, expect, it } from "vitest";
import { matchesQuery } from "./search";

const row = {
  title: "Cómo ahorrar dinero | Método 50/30/20",
  videoId: "6aJmN7ly9bA",
  source: "https://youtu.be/6aJmN7ly9bA",
  summary: "Summary: Saving money made simple.",
  summaryEs: "Resumen: Ahorrar es fácil.",
};

describe("matchesQuery", () => {
  it("matches everything when the query is empty", () => {
    expect(matchesQuery(row, "   ")).toBe(true);
  });

  it("ignores accents and letter case", () => {
    expect(matchesQuery(row, "como AHORRAR")).toBe(true);
    expect(matchesQuery(row, "metodo")).toBe(true);
    expect(matchesQuery(row, "facil")).toBe(true);
  });

  it("matches the video ID, link and summaries", () => {
    expect(matchesQuery(row, "6aJmN7")).toBe(true);
    expect(matchesQuery(row, "youtu.be")).toBe(true);
    expect(matchesQuery(row, "made simple")).toBe(true);
  });

  it("needs every word to match somewhere", () => {
    expect(matchesQuery(row, "ahorrar simple")).toBe(true);
    expect(matchesQuery(row, "ahorrar bitcoin")).toBe(false);
  });

  it("copes with missing fields", () => {
    expect(matchesQuery({ title: null, videoId: null, source: "", summary: null, summaryEs: null }, "x")).toBe(false);
  });
});
