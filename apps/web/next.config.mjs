/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @tracktist/core is consumed as TypeScript source from the workspace.
  transpilePackages: ["@tracktist/core"],
  eslint: {
    // Lint is run separately in CI; don't block production builds on it.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.ticketmaster.com" },
      { protocol: "https", hostname: "**.bandsintown.com" },
      { protocol: "https", hostname: "**.coverartarchive.org" },
      { protocol: "https", hostname: "**.musicbrainz.org" },
      { protocol: "https", hostname: "i.scdn.co" },
    ],
  },
  webpack: (config) => {
    // Resolve TypeScript ESM ".js" import specifiers to their ".ts" sources
    // (used by @tracktist/core and the server lib). Mirrors tsconfig "bundler".
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
