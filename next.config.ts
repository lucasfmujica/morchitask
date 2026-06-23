import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  /* config options here */
};

// Serwist injects a `webpack` config to build the service worker. Next 16's dev
// server uses Turbopack, which errors when it sees a webpack config. So we only
// wrap with Serwist for the production build (which runs `next build --webpack`);
// in development we export the plain config so Turbopack starts cleanly.
const isDev = process.env.NODE_ENV === "development";

// Only construct/apply Serwist for the production build. Calling withSerwistInit
// in dev (Turbopack) emits a noisy warning, so we skip it entirely.
export default isDev
  ? nextConfig
  : withSerwistInit({ swSrc: "app/sw.ts", swDest: "public/sw.js" })(nextConfig);
