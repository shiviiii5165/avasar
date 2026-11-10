import type { NextConfig } from "next";

/** Security headers for every response. CSP allows only our own origin plus Google Fonts (via next/font, self-hosted at build). */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' " + (process.env.AVSAR_AIT_BASE_URL ?? ""),
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // PGlite ships WASM and must load from node_modules at runtime rather than be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // Development only: the default bottom-left indicator covers the dashboard sidebar's collapse/expand control.
  devIndicators: { position: "bottom-right" },
  // Tailwind CSS v4 through its Turbopack loader (processes @import "tailwindcss" and @theme tokens).
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } }, // resume uploads are capped at 4 MB (Vercel functions accept up to 4.5 MB)
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
