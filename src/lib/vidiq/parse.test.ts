import { describe, expect, it } from "vitest";
import { classifyToolError, isMissingTranscript, parseBalance, parsePollResult, parseTranscript, readToolPayload } from "./parse";

describe("readToolPayload", () => {
  it("prefers structured content", () => {
    expect(readToolPayload({ structuredContent: { a: 1 }, content: [] })).toEqual({ a: 1 });
  });

  it("falls back to JSON in the first text block", () => {
    expect(readToolPayload({ content: [{ type: "text", text: '{"b":2}' }] })).toEqual({ b: 2 });
  });

  it("returns the raw text when it is not JSON", () => {
    expect(readToolPayload({ content: [{ type: "text", text: "plain" }] })).toBe("plain");
  });
});

describe("parsePollResult", () => {
  it("reads a running job", () => {
    expect(parsePollResult({ status: "inprogress", result: null })).toEqual({ state: "running" });
  });

  it("reads the analysis text of a completed job", () => {
    expect(parsePollResult({ status: "completed", result: { videoId: "x", analysisText: "Summary:\nHi" } })).toEqual({
      state: "done",
      text: "Summary:\nHi",
    });
  });

  it("falls back to the longest text field of a completed result", () => {
    expect(parsePollResult({ status: "completed", result: { url: "x", walkthrough: "Scene 1: intro" } })).toEqual({
      state: "done",
      text: "Scene 1: intro",
    });
  });

  it("explains failed, expired and refunded jobs", () => {
    expect(parsePollResult({ status: "failed", result: null, message: "Video unavailable", refunded: true })).toEqual({
      state: "failed",
      message: "Video unavailable. Credits were refunded.",
    });
    expect(parsePollResult({ status: "expired", result: null, message: null, refunded: false })).toEqual({
      state: "failed",
      message: "vidIQ did not finish this video in time.",
    });
  });

  it("does not repeat a refund note vidIQ already gave", () => {
    expect(
      parsePollResult({ status: "failed", result: null, message: "Analysis is temporarily unavailable. Your credits were refunded.", refunded: true }),
    ).toEqual({ state: "failed", message: "Analysis is temporarily unavailable. Your credits were refunded." });
  });

  it("treats a completed job without text as failed", () => {
    expect(parsePollResult({ status: "completed", result: {} })).toEqual({
      state: "failed",
      message: "vidIQ returned an empty summary.",
    });
  });
});

describe("classifyToolError", () => {
  it.each([
    ["Insufficient credits to run this tool", "credits"],
    ["You have 0 credits left", "credits"],
    ["Unauthorized: please sign in", "auth"],
    ["Rate limit exceeded, try again later", "transient"],
    ["Upstream timeout", "transient"],
    ["Video not found", "fatal"],
  ])("classifies %j as %s", (message, kind) => {
    expect(classifyToolError(message)).toBe(kind);
  });
});

describe("parseBalance", () => {
  it("reads total credits and the reset date", () => {
    expect(
      parseBalance({ type: "limited", totalCredits: 150, renewableResetsAt: "2026-11-02T01:01:49Z", addOnCredits: 0 }),
    ).toEqual({ unlimited: false, total: 150, resetsAt: "2026-11-02T01:01:49Z" });
  });

  it("handles unlimited plans", () => {
    expect(parseBalance({ type: "unlimited" })).toEqual({ unlimited: true, total: null, resetsAt: null });
  });
});

describe("parseTranscript", () => {
  it("reads the transcription text", () => {
    expect(parseTranscript({ videoId: "x", transcription: "  Hello there.  ", language: "en" })).toEqual({ status: "done", text: "Hello there." });
  });

  it("treats an empty transcription as unavailable", () => {
    expect(parseTranscript({ videoId: "x", transcription: "", language: "es" })).toEqual({ status: "unavailable" });
  });

  it("recognizes vidIQ's missing-language error", () => {
    expect(
      isMissingTranscript('No transcript is available in the requested language "es" for video 6aJmN7ly9bA. Retry without the language parameter.'),
    ).toBe(true);
    expect(isMissingTranscript("Video not found")).toBe(false);
  });
});
