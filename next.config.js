/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  // Don't try to bundle the chromium binaries / native deps; they're loaded
  // dynamically at runtime (locally via puppeteer, on Vercel via @sparticuz/chromium).
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium'],
  // Force the service worker and PWA manifest to be fetched fresh on every
  // navigation. Without this, Chrome / Vercel's edge can serve a stale sw.js
  // for hours after a deploy, defeating the auto-update mechanism.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },
};

module.exports = nextConfig;
