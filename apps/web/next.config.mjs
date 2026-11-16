/** @type {import('next').NextConfig} */
const api = process.env.API_INTERNAL_URL || 'http://localhost:4000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

export default {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  transpilePackages: ['@zeze/shared'],
  // Same-origin proxy: browser → Next → API, so session cookies stay first-party.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
      { source: '/v1/:path*', destination: `${api}/v1/:path*` },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
