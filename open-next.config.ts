import type { OpenNextConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

/**
 * Unlike the sister sites (which set incrementalCache: "dummy" and made every
 * `revalidate` a no-op), this uses the R2 incremental cache so ISR actually
 * persists. Requires the NEXT_INC_CACHE_R2_BUCKET binding in wrangler.jsonc
 * and a one-time `wrangler r2 bucket create wheretodump-inc-cache` before the
 * first remote deploy.
 */
const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: () => r2IncrementalCache,
      tagCache: "dummy",
      queue: "direct",
    },
  },
  edgeExternals: ["node:crypto"],
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
};

export default config;
