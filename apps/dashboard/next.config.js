/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a fully static export so the bot's Express server can serve it
  // from public/dashboard/ without a Node.js runtime for the dashboard itself.
  output: "export",
  // Static export requires trailing slashes so nested route paths resolve
  // to their index.html files (e.g. /setup/wallet/ → setup/wallet/index.html).
  trailingSlash: true,
  // Static export disables next/image optimization.
  images: { unoptimized: true },
  // Consume `shared` workspace package as TS source (JIT) instead of a build artifact.
  transpilePackages: ["shared"],
  reactStrictMode: true,
  poweredByHeader: false,
};

module.exports = nextConfig;
