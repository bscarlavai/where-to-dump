"use client";

import { useState } from "react";
import { getFacilityImageUrl, type ImageVariant } from "@/lib/cloudflare-images";

interface Props {
  src: string | null;
  cfImageId?: string | null;
  variant?: ImageVariant;
  alt: string;
  className?: string;
  priority?: boolean;
}

export function FacilityImage({ src, cfImageId, variant = "card", alt, className = "", priority }: Props) {
  const [failed, setFailed] = useState(false);

  const url = getFacilityImageUrl(src, cfImageId ?? null, variant);

  if (!url || failed) {
    return (
      <div className={`bg-gradient-to-br from-[#2B3037] to-[#4E555E] ${className}`} />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
    />
  );
}
