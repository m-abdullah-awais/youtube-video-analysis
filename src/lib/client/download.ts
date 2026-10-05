import { ApiError } from "./api";

/** Reads the file name the server suggests in Content-Disposition. */
function fileNameFrom(header: string | null, fallback: string): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return header?.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
}

/** Saves a Blob under a file name, through a temporary link. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Downloads a file from the app. Unlike a plain link, a server error is thrown
 * (and shown to the user) instead of being saved as a broken file.
 */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    throw new ApiError("The app server is not responding. Check that it is still running.", 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Download failed (${response.status}).`, response.status);
  }
  saveBlob(await response.blob(), fileNameFrom(response.headers.get("content-disposition"), fallbackName));
}
