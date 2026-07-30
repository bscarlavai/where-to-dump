import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Makes wrangler.jsonc bindings (D1) available in `next dev` via getCloudflareContext().
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Data pages change only on import/approval — let the CF edge absorb
        // traffic (especially crawlers). Admin/API excluded.
        source: "/((?!admin|api|auth).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/ads.txt",
        destination: "https://srv.adstxtmanager.com/19390/wheretodump.com",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
