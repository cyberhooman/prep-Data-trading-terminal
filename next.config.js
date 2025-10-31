/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Enable API routes
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
  // Optimize for Vercel deployment
  compress: true,
  poweredByHeader: false,
  // Enable experimental features for better performance
  experimental: {
    optimizeCss: true,
  },
}

module.exports = nextConfig
