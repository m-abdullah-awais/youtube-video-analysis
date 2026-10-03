import type { MetadataRoute } from "next";

/** Lets Chrome and Edge install the app in its own window, with its own icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Video Summaries",
    short_name: "Summaries",
    description: "Fill your YouTube spreadsheet's Description column with vidIQ summaries that follow your template.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#1e6b4f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
