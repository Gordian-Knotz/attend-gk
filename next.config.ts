import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PowerSync's Web SDK ships wa-sqlite as WebAssembly loaded from a worker.
  // Turbopack needs static image optimisation off so the .wasm assets copied
  // into public/@powersync/ by the postinstall are served untouched.
  images: { disableStaticImages: true },
  turbopack: {},

  // Only consulted for `next build --webpack` / older tooling; Turbopack
  // ignores this block. Kept so a webpack build doesn't fail on the .wasm.
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

export default nextConfig;
