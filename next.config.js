/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Configure webpack for TensorFlow.js
  webpack: (config) => {
    // Fixes npm packages that depend on `fs` module
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
    };
    
    return config;
  },
  // Ensure proper module resolution
  experimental: {
    esmExternals: 'loose',
  },
  // Disable CSS modules
  cssModules: false,
};

module.exports = nextConfig;
