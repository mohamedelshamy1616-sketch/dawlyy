import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  pageExtensions: process.env.NODE_ENV === 'production'
    ? ['tsx', 'ts', 'jsx', 'js']
    : ['tsx', 'ts', 'jsx', 'js', 'dev.tsx', 'dev.ts'],
  cacheComponents: true,
  // The floating dev badge covers the bottom navigation on phones (preview screenshots, Mohamed's own testing).
  devIndicators: false,
  partialPrefetching: true,
  transpilePackages: ["@dawlyy/core", "@dawlyy/db"],
  serverExternalPackages: ["postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
