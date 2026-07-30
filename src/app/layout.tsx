import type { Metadata } from "next";
import { Barlow_Condensed, Barlow } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import { siteUrl } from "./seo";
import "./globals.css";

const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const body = Barlow({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Where To Dump | Find Landfills, Transfer Stations & Recycling Centers Near You",
    template: "%s | Where To Dump",
  },
  description:
    "Find the nearest place to dump your trash. Landfills, transfer stations, recycling centers, e-waste drop-off, scrap yards, and RV dump stations across the United States, with hours, fees, and what they accept.",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text font-sans">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-8 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-text-mid">
        <div className="flex items-center gap-2">
          <span aria-hidden className="w-4 h-4 shrink-0 bg-accent" style={{ clipPath: "polygon(0 100%, 100% 100%, 100% 35%, 55% 35%, 40% 0, 0 0)" }} />
          <span className="font-serif font-bold uppercase tracking-wide text-primary">
            Where To <span className="text-accent">Dump</span>
          </span>
        </div>
        <div className="flex gap-6">
          <a href="/about" className="hover:text-primary transition-colors">About</a>
          <a href="/guides" className="hover:text-primary transition-colors">Guides</a>
          <a href="/submit" className="hover:text-primary transition-colors">Suggest a Facility</a>
          <a href="/privacy" className="hover:text-primary transition-colors">Privacy</a>
          <a href="/terms" className="hover:text-primary transition-colors">Terms</a>
        </div>
        <div>&copy; {new Date().getFullYear()}{' '}
          <a href="https://lavailabs.com" target="_blank" rel="noopener" className="hover:text-primary transition-colors">
            Lavai Labs LLC
          </a>
        </div>
      </div>
    </footer>
  );
}
