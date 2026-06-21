import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // wagmi/walletconnect/reown reference these optional deps via dynamic import; they aren't
  // installed (optional), so point Turbopack at an empty stub to keep the build from failing.
  turbopack: {
    resolveAlias: {
      accounts: "./lib/empty-module.js",
      "pino-pretty": "./lib/empty-module.js",
      lokijs: "./lib/empty-module.js",
      encoding: "./lib/empty-module.js",
    },
  },
};

export default nextConfig;
