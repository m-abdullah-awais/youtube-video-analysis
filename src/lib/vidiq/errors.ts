/**
 * auth: the vidIQ connection needs to be signed in again.
 * credits: the account ran out of credits.
 * transient: network or server hiccup, safe to retry.
 * fatal: retrying will not help.
 */
export type VidiqErrorKind = "auth" | "credits" | "transient" | "fatal";

export class VidiqError extends Error {
  constructor(
    readonly kind: VidiqErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "VidiqError";
  }
}

export function isVidiqError(error: unknown, kind?: VidiqErrorKind): error is VidiqError {
  return error instanceof VidiqError && (kind === undefined || error.kind === kind);
}
