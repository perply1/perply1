/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sov/proof", "@sov/percolator-sdk", "@drift-labs/sdk"],
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.pexels.com", pathname: "/**" },
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Drift SDK / Anchor have Node.js deps that aren't used in browser at runtime
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        net: false,
        tls: false,
        child_process: false,
        readline: false,
        worker_threads: false,
      };
    }
    return config;
  },
};

export default nextConfig;
