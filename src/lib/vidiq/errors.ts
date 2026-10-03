import type { ErrorKey } from "../i18n/errors";

/**
 * auth: the vidIQ connection needs to be signed in again.
 * credits: the account ran out of credits.
 * transient: network or server hiccup, safe to retry.
 * fatal: retrying will not help.
 */
export type VidiqErrorKind = "auth" | "credits" | "transient" | "fatal";

export class VidiqError extends Error {
  /**
   * @param message English text, also what gets stored on a failed row.
   * @param key When set, the API shows this translated message instead of `message`.
   */
  constructor(
    readonly kind: VidiqErrorKind,
    message: string,
    readonly key?: ErrorKey,
  ) {
    super(message);
    this.name = "VidiqError";
  }
}

export function isVidiqError(error: unknown, kind?: VidiqErrorKind): error is VidiqError {
  return error instanceof VidiqError && (kind === undefined || error.kind === kind);
}
