import type { PollResult, TranscriptResult } from "../jobs/runner";
import type { VidiqErrorKind } from "./errors";

type ToolResult = { structuredContent?: unknown; content?: unknown; [key: string]: unknown };

/** vidIQ tools return structured content, with the same JSON as text for older clients. */
export function readToolPayload(result: ToolResult): unknown {
  if (result.structuredContent) return result.structuredContent;
  const first = Array.isArray(result.content) ? result.content[0] : undefined;
  const text = first && typeof first === "object" && "text" in first ? String(first.text) : "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function toolErrorText(result: ToolResult): string {
  const blocks = Array.isArray(result.content) ? result.content : [];
  const text = blocks
    .map((b) => (b && typeof b === "object" && "text" in b ? String(b.text) : ""))
    .join(" ")
    .trim();
  return text || "vidIQ returned an error.";
}

type PollPayload = {
  status?: string;
  result?: Record<string, unknown> | null;
  message?: string | null;
  refunded?: boolean;
};

export function parsePollResult(payload: PollPayload): PollResult {
  switch (payload.status) {
    case "inprogress":
      return { state: "running" };
    case "completed": {
      const text = pickText(payload.result ?? {});
      return text ? { state: "done", text } : { state: "failed", message: "vidIQ returned an empty summary." };
    }
    default: {
      const base =
        payload.message?.replace(/\.?\s*$/, ".") ??
        (payload.status === "expired" ? "vidIQ did not finish this video in time." : "vidIQ could not summarize this video.");
      const noteRefund = payload.refunded && !/refund/i.test(base);
      return { state: "failed", message: noteRefund ? `${base} Credits were refunded.` : base };
    }
  }
}

function pickText(result: Record<string, unknown>): string | null {
  if (typeof result.analysisText === "string" && result.analysisText.trim()) return result.analysisText;
  const strings = Object.values(result).filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return strings.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function classifyToolError(message: string): VidiqErrorKind {
  if (/credit/i.test(message)) return "credits";
  if (/unauthori[sz]ed|sign in|log in|authenticat|token expired|\b401\b/i.test(message)) return "auth";
  if (/rate limit|too many requests|timeout|timed out|temporar|try again|\b50[234]\b|unavailable right now/i.test(message)) {
    return "transient";
  }
  return "fatal";
}

/** vidIQ answers `{ videoId, transcription, language }`; empty text counts as no transcript. */
export function parseTranscript(payload: { transcription?: unknown; [key: string]: unknown }): TranscriptResult {
  const text = typeof payload?.transcription === "string" ? payload.transcription.trim() : "";
  return text ? { status: "done", text } : { status: "unavailable" };
}

/** vidIQ's answer when a video has no captions in the requested language. */
export function isMissingTranscript(message: string): boolean {
  return /no transcript is available|no captions? (are |is )?available/i.test(message);
}

export type Balance = { unlimited: boolean; total: number | null; resetsAt: string | null };

export function parseBalance(payload: Record<string, unknown>): Balance {
  if (payload.type === "unlimited") return { unlimited: true, total: null, resetsAt: null };
  return {
    unlimited: false,
    total: typeof payload.totalCredits === "number" ? payload.totalCredits : null,
    resetsAt: typeof payload.renewableResetsAt === "string" ? payload.renewableResetsAt : null,
  };
}
