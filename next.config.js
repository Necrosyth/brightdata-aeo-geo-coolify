/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
};

module.exports = nextConfig;
