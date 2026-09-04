import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * pdfjs must be required from node_modules at runtime, not bundled.
   *
   * It resolves its worker by path relative to its own module location. Once
   * the bundler rewrites that location, the lookup fails with "Setting up
   * fake worker failed: Cannot find module .../pdf.worker.mjs" — which only
   * happens inside the Next server, so the extraction tests pass while the
   * route 422s. Keeping the package external restores ordinary resolution.
   */
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
