const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type RequestInfo = {
  method: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
};

/**
 * The app has no login, so it only trusts itself:
 * - the Host must be this computer (stops DNS rebinding),
 * - changes must come from the app's own page (stops other websites
 *   from starting runs and spending credits in the background).
 * Returns why a request is refused, or null when it is fine.
 */
export function rejectReason({ method, host, origin, secFetchSite }: RequestInfo): string | null {
  const hostname = host?.replace(/:\d+$/, "").toLowerCase();
  if (!hostname || !LOCAL_HOSTS.has(hostname)) return "Requests must use the localhost host name.";
  if (SAFE_METHODS.has(method.toUpperCase())) return null;

  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    return "Blocked a change requested by another website.";
  }
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return "Blocked a change requested by another website.";
    }
    if (originHost !== host) return "Blocked a change requested by another website.";
  }
  return null;
}
