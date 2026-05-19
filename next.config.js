/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['playwright', 'pdfkit', 'natural'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('playwright', 'pdfkit');
    }
    return config;
  },
};

module.exports = nextConfig;
