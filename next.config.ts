import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // There is a stray package-lock.json in the Windows home directory, so
  // Next inferred C:\Users\PAC as the workspace root and warned on every
  // build. Harmless locally; on a standalone/Railway build it decides which
  // files get traced and copied, so an inferred root two levels too high
  // either bloats the output or misses files. Pinned to this directory.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),

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
