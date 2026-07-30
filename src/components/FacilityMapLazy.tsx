"use client";

import dynamic from "next/dynamic";

const FacilityMapLazy = dynamic(() => import("@/components/FacilityMap").then((m) => m.FacilityMap), {
  ssr: false,
  loading: () => <div className="rounded-xl border border-border bg-gradient-to-br from-primary-pale to-green-pale h-80" />,
});

export { FacilityMapLazy };
