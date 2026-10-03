export type FailureReason =
  | "busy"
  | "private"
  | "unavailable"
  | "noCaptions"
  | "tooLong"
  | "wrongFormat"
  | "timeout"
  | "network"
  | "empty"
  | "credits"
  | "unknown";

/** Ordered: the first matching pattern wins. */
const PATTERNS: [FailureReason, RegExp][] = [
  ["credits", /credit(?!s were refunded)/i],
  ["busy", /temporar|try again|overloaded|busy|rate limit/i],
  ["private", /private/i],
  ["noCaptions", /caption|transcript|subtitle/i],
  ["tooLong", /too long|duration|exceeds/i],
  ["wrongFormat", /short-?form|long-?form/i],
  ["timeout", /in time|timed? ?out|expired/i],
  ["network", /could not reach|network|fetch failed|econn|socket/i],
  ["empty", /empty summary/i],
  ["unavailable", /unavailable|not found|removed|deleted|does not exist|no longer/i],
];

/** Failures that usually go away on their own; the runner retries these automatically. */
export const TEMPORARY_REASONS: readonly FailureReason[] = ["busy", "timeout"];

/** Turns vidIQ's failure text into a known reason the UI can explain in any language. */
export function describeFailure(message: string): { reason: FailureReason; refunded: boolean } {
  const reason = PATTERNS.find(([, pattern]) => pattern.test(message))?.[0] ?? "unknown";
  return { reason, refunded: /refunded/i.test(message) };
}
