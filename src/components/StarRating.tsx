"use client";

import { IconStar, IconStarOutline } from "@/components/icons";

interface DisplayProps {
  rating: number;
  count?: number;
  size?: "sm" | "md" | "lg";
}

export function StarRatingDisplay({ rating, count, size = "md" }: DisplayProps) {
  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };
  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <div className={`flex items-center gap-1 ${textSizes[size]} font-semibold`}>
      <IconStar className={`${iconSizes[size]} text-accent`} />
      <span>{rating.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-text-light font-normal">
          ({count.toLocaleString()})
        </span>
      )}
    </div>
  );
}

interface InputProps {
  value: number;
  onChange: (rating: number) => void;
}

const LABELS = ["", "Poor", "Fair", "Good", "Great", "Amazing"];

export function StarRatingInput({ value, onChange }: InputProps) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="transition-colors hover:text-accent"
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
        >
          {star <= value ? (
            <IconStar className="w-7 h-7 text-accent" />
          ) : (
            <IconStarOutline className="w-7 h-7 text-border" />
          )}
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-sm text-text-mid">{LABELS[value]}</span>
      )}
    </div>
  );
}
