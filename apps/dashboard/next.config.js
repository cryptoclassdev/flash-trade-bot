/** @type {import('next').NextConfig} */
const nextConfig = {
  // Consume `shared` workspace package as TS source (JIT) instead of a build artifact.
  transpilePackages: ["shared"],
  reactStrictMode: true,
  poweredByHeader: false,
};

module.exports = nextConfig;
