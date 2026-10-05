import { describe, expect, it } from "vitest";
import {
  BILINGUAL_MARKER,
  MAX_TEMPLATE_LENGTH,
  buildPrompt,
  cleanSummary,
  missingSections,
  sectionWarning,
  splitBilingual,
  templateProblem,
  templateSections,
  toPlainText,
} from "./template";

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

  it("asks for an English and a Spanish version separated by the marker", () => {
    const prompt = buildPrompt(TEMPLATE);
    expect(prompt).toContain(BILINGUAL_MARKER);
    expect(prompt).toMatch(/first in English/i);
    expect(prompt).toMatch(/Spanish/);
  });

  it("rejects templates that are empty or too long", () => {
    expect(templateProblem("   ")).toBe("templateEmpty");
    expect(templateProblem("x".repeat(MAX_TEMPLATE_LENGTH + 1))).toBe("templateTooLong");
    expect(templateProblem(TEMPLATE)).toBeNull();
    expect(() => buildPrompt("   ")).toThrow(/template/i);
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

describe("splitBilingual", () => {
  const real =
    "Summary: About email.\n\nKey Points:\n- One\n\nTopics: email\n\n=== ESPAÑOL ===\n\nResumen: Sobre el correo.\n\nPuntos Clave:\n- Uno\n\nTemas: correo";

  it("splits a real two-language answer into clean halves", () => {
    expect(splitBilingual(real, TEMPLATE)).toEqual({
      en: "Summary: About email.\n\nKey Points:\n- One\n\nTopics: email",
      es: "Resumen: Sobre el correo.\n\nPuntos Clave:\n- Uno\n\nTemas: correo",
    });
  });

  it.each(["=== SPANISH ===", "==== Español ====", "**=== ESPAÑOL ===**", "=== ESPANOL ==="])("accepts the marker written as %j", (marker) => {
    expect(splitBilingual(`Summary: a\n${marker}\nResumen: b`, TEMPLATE)).toEqual({ en: "Summary: a", es: "Resumen: b" });
  });

  it("drops a lead-in before the English half", () => {
    expect(splitBilingual("Here you go.\n\nSummary: a\n=== ESPAÑOL ===\nResumen: b", TEMPLATE)?.en).toBe("Summary: a");
  });

  it("returns null when there is no marker or a half is empty", () => {
    expect(splitBilingual("Summary: a\nTopics: b", TEMPLATE)).toBeNull();
    expect(splitBilingual("Summary: a\n=== ESPAÑOL ===\n   ", TEMPLATE)).toBeNull();
  });
});

describe("sectionWarning", () => {
  it("is quiet when either half has every template section", () => {
    expect(sectionWarning(TEMPLATE, "Summary: a\nKey Points: b\nTopics: c", "Resumen: a")).toBeNull();
    const spanishTemplate = "Resumen: 2 frases.\nTemas: lista.";
    expect(sectionWarning(spanishTemplate, "Summary: a\nTopics: b", "Resumen: a\nTemas: b")).toBeNull();
  });

  it("names the sections missing from the closer half", () => {
    expect(sectionWarning(TEMPLATE, "Summary: a\nTopics: c", "Resumen: a")).toBe("Missing section: Key Points");
  });
});

describe("cleanSummary", () => {
  it("drops a lead-in sentence before the first template section", () => {
    expect(cleanSummary("Here is the summary of the video.\n\n**Summary:**\nGood.\n\nTopics: a", TEMPLATE)).toBe(
      "Summary:\nGood.\n\nTopics: a",
    );
  });

  it("keeps everything when no section is found", () => {
    expect(cleanSummary("Just a paragraph.", TEMPLATE)).toBe("Just a paragraph.");
  });

  it("keeps text untouched when the template has no sections", () => {
    expect(cleanSummary("Intro.\nMore.", "Write one paragraph.")).toBe("Intro.\nMore.");
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
