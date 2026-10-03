import { cn } from "@/lib/utils";

/** The app mark: a video (play) turning into summary lines. Same artwork as src/app/icon.svg. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7 shrink-0", className)}>
      <rect width="32" height="32" rx="7" fill="var(--primary)" />
      <path
        d="M8.2 10.4v11.2c0 .9 1 1.4 1.7.9l7.6-5.6c.6-.4.6-1.3 0-1.8l-7.6-5.6c-.7-.5-1.7 0-1.7.9z"
        fill="var(--primary-foreground)"
      />
      <rect x="19.5" y="10.6" width="6.5" height="2.6" rx="1.3" fill="var(--primary-foreground)" />
      <rect x="19.5" y="14.7" width="6.5" height="2.6" rx="1.3" fill="var(--primary-foreground)" fillOpacity="0.8" />
      <rect x="19.5" y="18.8" width="4.2" height="2.6" rx="1.3" fill="var(--primary-foreground)" fillOpacity="0.6" />
    </svg>
  );
}
