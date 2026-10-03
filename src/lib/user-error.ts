import { errorText, type ErrorKey } from "./i18n/errors";

type Params = Record<string, string | number>;

/** A problem the user can fix. Carries a translation key so the API can answer in the user's language. */
export class UserError extends Error {
  constructor(
    readonly key: ErrorKey,
    readonly params: Params = {},
    readonly status = 400,
  ) {
    super(errorText("en", key, params));
    this.name = "UserError";
  }
}
