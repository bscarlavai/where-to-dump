/**
 * Site mark: Lucide trash-2 (ISC) with the location pin badged on the
 * bottom-right corner. Transparent ground; strokes adapt to the surface.
 * Keep geometry in sync with scripts/brand/generate-assets.ts.
 */

interface Props {
  /** "dark" for charcoal surfaces (navbar), "light" for page surfaces. */
  variant: "dark" | "light";
  /** Rendered square size in px (inline-styled so it never depends on CSS). */
  size?: number;
  className?: string;
}

const TRASH2_PATHS = (
  <>
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>
);

const PIN_PATH =
  "M32 62 C32 62 8 38 8 23 C8 9 19 2 32 2 C45 2 56 9 56 23 C56 38 32 62 32 62 Z";

export function LogoMark({ variant, size = 32, className = "" }: Props) {
  const canStroke = variant === "dark" ? "#FFFFFF" : "#1B1C1E";
  // Keyline separates the pin from the can; match it to the surface color
  const keyline = variant === "dark" ? "#1B1C1E" : "#F5F5F4";

  return (
    <svg
      viewBox="0 0 64 64"
      style={{ width: size, height: size, flexShrink: 0 }}
      className={className}
      aria-hidden
      focusable="false"
    >
      <g
        transform="translate(6.5 6) scale(2)"
        stroke={canStroke}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {TRASH2_PATHS}
      </g>
      <path
        transform="translate(33.5 33) scale(0.42)"
        d={PIN_PATH}
        fill="#FF6B1A"
        stroke={keyline}
        strokeWidth="4"
      />
      <circle transform="translate(33.5 33) scale(0.42)" cx="32" cy="24" r="8" fill={keyline} />
    </svg>
  );
}
