import type { Metadata } from "next";
import { canonicalUrl } from "@/app/seo";

export const metadata: Metadata = {
  title: "Waste Disposal Near Me | Find the Closest Dump",
  description:
    "Use your location to find the closest landfill, transfer station, recycling center, or e-waste drop-off. Distances, hours, and ratings on a live map.",
  alternates: { canonical: canonicalUrl("/near-me") },
};

export default function NearMeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
