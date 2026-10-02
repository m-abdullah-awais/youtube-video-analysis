export type VideoRef = { id: string; isShort: boolean };

const ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"]);
const PATH_PREFIXES = ["embed", "live", "v", "shorts"];

/** Reads a YouTube video ID from a URL or a bare 11-character ID. */
export function parseVideoRef(input: string): VideoRef | null {
  const value = input.trim();
  if (!value) return null;
  if (ID.test(value)) return { id: value, isShort: false };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return toRef(segments[0], false);
  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (segments[0] === "watch") return toRef(url.searchParams.get("v"), false);
  if (PATH_PREFIXES.includes(segments[0])) return toRef(segments[1], segments[0] === "shorts");
  return null;
}

function toRef(candidate: string | null | undefined, isShort: boolean): VideoRef | null {
  return candidate && ID.test(candidate) ? { id: candidate, isShort } : null;
}
