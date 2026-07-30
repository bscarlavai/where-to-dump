"use client";

import Link from "next/link";
import { useState } from "react";
import { LogoMark } from "@/components/LogoMark";

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="nav-frosted sticky top-0 z-50 border-b border-border">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark variant="dark" size={34} />
          <span className="font-serif text-2xl font-bold uppercase tracking-wide text-white">
            Where To <span className="text-accent">Dump</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden sm:flex items-center gap-6 text-sm font-semibold uppercase tracking-wide">
          <Link href="/states" className="text-white/85 hover:text-accent transition-colors">
            States
          </Link>
          <Link href="/near-me" className="text-white/85 hover:text-accent transition-colors">
            Near Me
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-2 text-white/85"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-border px-4 py-3 flex flex-col gap-3 bg-bg">
          <Link href="/states" className="text-sm font-medium text-text-mid hover:text-primary" onClick={() => setMenuOpen(false)}>
            States
          </Link>
          <Link href="/near-me" className="text-sm font-medium text-text-mid hover:text-primary" onClick={() => setMenuOpen(false)}>
            Near Me
          </Link>
        </div>
      )}
    </nav>
  );
}
