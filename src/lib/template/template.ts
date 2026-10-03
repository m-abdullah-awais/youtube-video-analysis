/** vidIQ accepts prompts up to 2000 characters; the rest is our instruction. */
export const MAX_TEMPLATE_LENGTH = 1500;

export type SummaryLanguage = "auto" | "en" | "es";

export const DEFAULT_TEMPLATE = [
  "Summary: 2-3 sentences on what the video covers and who it is for.",
  "Key Points: 3-5 bullet points with the main takeaways.",
  "Topics: a comma-separated list of the main topics.",
].join("\n");

export const DEFAULT_TEMPLATE_ES = [
  "Resumen: 2-3 frases sobre de qué trata el video y para quién es.",
  "Puntos clave: 3-5 viñetas con las ideas principales.",
  "Temas: una lista de los temas principales separados por comas.",
].join("\n");

const LANGUAGE_INSTRUCTION: Record<SummaryLanguage, string> = {
  auto: "Write it in the language spoken in the video.",
  en: "Write it in English.",
  es: "Write it in Spanish.",
};

const INSTRUCTION = [
  "Write a summary of this video to be used as its YouTube description.",
  "Follow the template below exactly: use the same section names, in the same order,",
  "with nothing before the first section or after the last one.",
  'Write plain text without Markdown symbols such as # or **. Use "- " for bullet points.',
].join(" ");

/** Why a template cannot be used, or null when it is fine. */
export function templateProblem(template: string): "templateEmpty" | "templateTooLong" | null {
  const body = template.trim();
  if (!body) return "templateEmpty";
  return body.length > MAX_TEMPLATE_LENGTH ? "templateTooLong" : null;
}

export function buildPrompt(template: string, language: SummaryLanguage = "auto"): string {
  const problem = templateProblem(template);
  if (problem) throw new Error(`Cannot use this template: ${problem}`);
  return `${INSTRUCTION} ${LANGUAGE_INSTRUCTION[language]}\n\nTemplate:\n${template.trim()}`;
}

/** Section names from "Name: ..." lines and Markdown headings. */
export function templateSections(template: string): string[] {
  const sections: string[] = [];
  for (const line of template.split(/\r?\n/)) {
    const heading = line.match(/^\s*#{1,6}\s+(.+?)\s*:?\s*$/);
    const labelled = line.match(/^\s*\**([A-Za-z][^:*\n]{0,60}?)\**\s*:/);
    const name = (heading?.[1] ?? labelled?.[1])?.replace(/[*_]/g, "").trim();
    if (name) sections.push(name);
  }
  return sections;
}

/** Template sections that no output line starts with. */
export function missingSections(template: string, output: string): string[] {
  const starts = output
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s#>*_-]+/, "").replace(/[*_]/g, "").toLowerCase());
  return templateSections(template).filter((name) => !starts.some((s) => s.startsWith(name.toLowerCase())));
}

/**
 * Final text for the Description cell: plain text, starting at the first template
 * section (vidIQ sometimes adds a lead-in such as "Here is the summary of the video.").
 */
export function cleanSummary(text: string, template: string): string {
  const plain = toPlainText(text);
  const names = templateSections(template).map((n) => n.toLowerCase());
  if (names.length === 0) return plain;
  const lines = plain.split("\n");
  const first = lines.findIndex((line) => names.some((n) => line.toLowerCase().startsWith(n)));
  return first > 0 ? lines.slice(first).join("\n").trim() : plain;
}

/** Strips Markdown so the text reads cleanly in a plain-text YouTube description. */
export function toPlainText(markdown: string): string {
  const lines = markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !/^\s*([-*_])(\s*\1){2,}\s*$/.test(line))
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/^(\s*)[*+]\s+/, "$1- ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\w)/g, "$1$2")
        .replace(/(^|\W)_(?!\s)([^_\n]+?)(?<!\s)_(?!\w)/g, "$1$2")
        .replace(/`([^`]+)`/g, "$1")
        .trimEnd(),
    );
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
