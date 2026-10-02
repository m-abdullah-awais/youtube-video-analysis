import { describe, expect, it } from "vitest";
import { MAX_TEMPLATE_LENGTH, buildPrompt, missingSections, templateSections, toPlainText } from "./template";

const TEMPLATE = "Summary: 2-3 sentences.\nKey Points: 3-5 bullets.\nTopics: comma-separated list.";

describe("buildPrompt", () => {
  it("includes the template and the formatting rules", () => {
    const prompt = buildPrompt(TEMPLATE);
    expect(prompt).toContain(TEMPLATE);
    expect(prompt).toMatch(/exactly/i);
  });

  it("stays within vidIQ's 2000 character prompt limit for the longest allowed template", () => {
    expect(buildPrompt("x".repeat(MAX_TEMPLATE_LENGTH)).length).toBeLessThanOrEqual(2000);
  });

  it("rejects templates that are empty or too long", () => {
    expect(() => buildPrompt("   ")).toThrow(/template/i);
    expect(() => buildPrompt("x".repeat(MAX_TEMPLATE_LENGTH + 1))).toThrow(/characters/i);
  });
});

describe("templateSections", () => {
  it("reads section names from 'Name:' lines and Markdown headings", () => {
    expect(templateSections(TEMPLATE)).toEqual(["Summary", "Key Points", "Topics"]);
    expect(templateSections("## Overview\nwrite it\n### Takeaways\n- a")).toEqual(["Overview", "Takeaways"]);
  });
});

describe("missingSections", () => {
  it("lists template sections that do not appear in the output", () => {
    expect(missingSections(TEMPLATE, "Summary:\nok\n\nTopics:\na, b")).toEqual(["Key Points"]);
  });

  it("accepts a real vidIQ Video Watch response", () => {
    const real =
      'Summary:\nRick Astley performs his 1987 debut hit single "Never Gonna Give You Up".\n\nKey Points:\n- Rick Astley showcases his signature vocal style.\n- Backup performers deliver dynamic choreography.\n\nTopics:\nRick Astley, 1980s music, pop music';
    expect(missingSections(TEMPLATE, real)).toEqual([]);
    expect(toPlainText(real)).toBe(real);
  });

  it("matches headings case-insensitively and ignores Markdown markers", () => {
    expect(missingSections(TEMPLATE, "### summary\nx\n**KEY POINTS:**\n- y\n## Topics\nz")).toEqual([]);
  });
});

describe("toPlainText", () => {
  it("removes Markdown syntax but keeps structure", () => {
    const md = [
      "### Summary",
      "This is **bold**, __strong__, *italic* and `code`.",
      "",
      "",
      "",
      "**Key Points:**",
      "* First",
      "+ Second",
      "  - Nested",
      "1. Numbered",
      "> Quoted line",
      "See [the docs](https://example.com) and ![img](https://x.y/z.png)",
      "---",
      "Topics: a, b",
    ].join("\n");
    expect(toPlainText(md)).toBe(
      [
        "Summary",
        "This is bold, strong, italic and code.",
        "",
        "Key Points:",
        "- First",
        "- Second",
        "  - Nested",
        "1. Numbered",
        "Quoted line",
        "See the docs (https://example.com) and",
        "Topics: a, b",
      ].join("\n"),
    );
  });

  it("leaves snake_case words and stray asterisks in numbers alone", () => {
    expect(toPlainText("Use video_id and 2 * 3 = 6")).toBe("Use video_id and 2 * 3 = 6");
  });

  it("trims surrounding whitespace and normalizes line endings", () => {
    expect(toPlainText("\r\n  Summary:\r\nText  \r\n\r\n")).toBe("Summary:\nText");
  });
});
