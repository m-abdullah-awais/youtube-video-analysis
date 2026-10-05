import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Messages } from "@/lib/i18n/messages";
import type { Report, ReportItem } from "./api";
import { displayRow } from "./format";

const INK = "#17202B";
const MUTED = "#556170";
const ACCENT = "#1E6B4F";
const LINE = "#DADFE5";
const PAGE_WIDTH = 595.28; // A4
const MARGIN_X = 56;

type Words = { t: Messages; date: (value: number) => string };

/** The run name as people read it: without the spreadsheet's file extension. */
function runName(report: Report): string {
  return report.job.name.replace(/\.(csv|xlsx|xls)$/i, "");
}

/** Loads pdfmake (and its Roboto font, which covers Spanish accents) only when a PDF is made. */
async function loadPdfMake() {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake;
}

function videoUrl(item: ReportItem): string | null {
  if (!item.videoId) return null;
  return item.isShort ? `https://www.youtube.com/shorts/${item.videoId}` : `https://www.youtube.com/watch?v=${item.videoId}`;
}

/** Summary text with "Section:" names in bold and "- " lines as bullets. */
function summaryContent(text: string): Content[] {
  const blocks: Content[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push({ ul: bullets, margin: [0, 2, 0, 6], markerColor: ACCENT });
    bullets = [];
  };
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (/^[-•]\s+/.test(trimmed)) {
      bullets.push(trimmed.replace(/^[-•]\s+/, ""));
      continue;
    }
    flush();
    if (!trimmed) continue;
    const label = trimmed.match(/^([^:]{1,60}):\s*(.*)$/);
    blocks.push(
      label
        ? { text: [{ text: `${label[1]}: `, bold: true }, { text: label[2] }], margin: [0, 4, 0, 2] }
        : { text: trimmed, margin: [0, 0, 0, 4] },
    );
  }
  flush();
  return blocks;
}

function heading(text: string): Content {
  return { text, style: "heading", margin: [0, 18, 0, 6] };
}

function missing(text: string): Content {
  return { text, italics: true, color: MUTED };
}

function videoSection(item: ReportItem, words: Words, first: boolean): Content[] {
  const { t } = words;
  const url = videoUrl(item);
  const summary = (text: string | null, title: string) => [heading(title), ...(text ? summaryContent(text) : [missing(t.pdf.notAvailable)])];
  const transcript = (language: "en" | "es", title: string) => {
    const entry = item.transcripts[language];
    const body: Content =
      entry?.status === "done" && entry.text
        ? { text: entry.text, style: "transcript" }
        : missing(
            entry?.status === "unavailable"
              ? t.run.transcriptUnavailable(t.configure.languageWords[language])
              : t.pdf.notAvailable,
          );
    return [heading(title), body];
  };

  return [
    {
      columns: [
        { text: t.pdf.row(String(displayRow(item.sheetRow))), color: MUTED, fontSize: 9 },
        url ? { text: t.pdf.watch, link: url, color: ACCENT, fontSize: 9, alignment: "right" } : { text: "" },
      ],
      pageBreak: first ? undefined : "before",
    },
    { text: item.title || item.videoId || "", style: "title", margin: [0, 6, 0, 2] },
    ...(item.videoId ? [{ text: item.videoId, color: MUTED, fontSize: 9 } as Content] : []),
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: PAGE_WIDTH - MARGIN_X * 2, y2: 0, lineWidth: 1, lineColor: LINE }], margin: [0, 10, 0, 0] },
    ...summary(item.summaryEn, t.run.tabs.summaryEn),
    ...summary(item.summaryEs, t.run.tabs.summaryEs),
    ...transcript("en", t.run.tabs.transcriptEn),
    ...transcript("es", t.run.tabs.transcriptEs),
  ];
}

function cover(report: Report, words: Words): Content[] {
  const { t, date } = words;
  return [
    {
      canvas: [{ type: "rect", x: -MARGIN_X, y: -64, w: PAGE_WIDTH, h: 150, color: ACCENT }],
      absolutePosition: { x: MARGIN_X, y: 64 },
    },
    { text: t.appName, color: "#FFFFFF", fontSize: 11, bold: true, margin: [0, 0, 0, 6] },
    { text: runName(report), color: "#FFFFFF", fontSize: runName(report).length > 48 ? 16 : 22, bold: true },
    { text: `${t.pdf.created(date(Date.now()))}    ${t.pdf.videos(report.items.length)}`, color: MUTED, margin: [0, 48, 0, 18] },
    {
      table: {
        widths: [44, "*"],
        body: report.items.map((item) => [
          { text: displayRow(item.sheetRow), color: MUTED },
          { text: item.title || item.videoId || "", color: INK },
        ]),
      },
      layout: {
        hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
        vLineWidth: () => 0,
        hLineColor: () => LINE,
        paddingTop: () => 5,
        paddingBottom: () => 5,
      },
    },
  ];
}

function documentFor(report: Report, words: Words, withCover: boolean): TDocumentDefinitions {
  const { t } = words;
  const sections = report.items.flatMap((item, i) => videoSection(item, words, !withCover && i === 0));
  return {
    pageSize: "A4",
    pageMargins: [MARGIN_X, 64, MARGIN_X, 56],
    info: { title: runName(report), creator: t.appName },
    defaultStyle: { font: "Roboto", fontSize: 10.5, color: INK, lineHeight: 1.3 },
    styles: {
      title: { fontSize: 17, bold: true, lineHeight: 1.15 },
      heading: { fontSize: 11, bold: true, color: ACCENT },
      transcript: { fontSize: 9.5, lineHeight: 1.4, color: INK },
    },
    footer: (page: number, total: number) => ({
      columns: [
        { text: t.appName, color: MUTED, fontSize: 8 },
        { text: t.pdf.page(page, total), color: MUTED, fontSize: 8, alignment: "right" },
      ],
      margin: [MARGIN_X, 20, MARGIN_X, 0],
    }),
    content: withCover ? [...cover(report, words), ...sections.map((c, i) => (i === 0 ? withBreak(c) : c))] : sections,
  };
}

/** The first video after the cover starts on a new page. */
function withBreak(content: Content): Content {
  return typeof content === "object" && content !== null && !Array.isArray(content)
    ? ({ ...content, pageBreak: "before" } as Content)
    : content;
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "report";
}

/** A PDF with every finished video (cover page plus one section each). */
export async function downloadRunPdf(report: Report, words: Words): Promise<void> {
  const pdfMake = await loadPdfMake();
  await pdfMake.createPdf(documentFor(report, words, true)).download(`${safeName(runName(report))} (report).pdf`);
}

/** A PDF for a single video. */
export async function downloadVideoPdf(report: Report, words: Words): Promise<void> {
  const item = report.items[0];
  const pdfMake = await loadPdfMake();
  const name = safeName(item?.title || item?.videoId || runName(report));
  await pdfMake.createPdf(documentFor(report, words, false)).download(`${name}.pdf`);
}
