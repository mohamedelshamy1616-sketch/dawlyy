import type { MetadataRoute } from "next";

// Colors mirror --background / --primary in app/globals.css (oklch there, hex here because manifests need hex).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DAWLYY",
    short_name: "DAWLYY",
    description: "Online coaching operating system",
    dir: "auto",
    display: "standalone",
    start_url: "/ar/app/today",
    scope: "/",
    theme_color: "#171717",
    background_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
