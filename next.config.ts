import path from 'node:path';
import type { NextConfig } from 'next';

const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(self), microphone=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  // build from this folder even when another lockfile sits in a parent folder
  turbopack: { root: path.resolve(__dirname) },
  reactStrictMode: true,
  // the little round Next.js badge is a development aid; it is never in a production build, and this keeps it out of development too
  devIndicators: false,
  poweredByHeader: false,
  // `docker build` uses the self-contained server output; other hosts ignore it.
  output: 'standalone',
  // The API is a separate Python service (backend/). The browser keeps calling same-origin `/api/...`;
  // Next forwards it, so cookies stay first-party and no CORS setup is needed.
  async rewrites() {
    const api = (process.env.API_ORIGIN || 'http://127.0.0.1:8000').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
    ];
  },
  // three.js and the R3F ecosystem ship modern ESM; no extra transpilation is needed.
  // Turn on the React Compiler later with `reactCompiler: true` (needs babel-plugin-react-compiler).
};

export default nextConfig;
