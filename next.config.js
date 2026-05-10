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
};

module.exports = nextConfig;
