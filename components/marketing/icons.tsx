/**
 * The handful of strokes the landing draws by hand. The app's own glyphs
 * (lucide) are a different weight; these match the canvas so the logo check
 * and the "fits" check read as the same mark.
 */
export function CheckIcon({
  size = 14,
  strokeWidth = 2.6,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

export function ArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />
    </svg>
  );
}

/** The logo tile: the "it fits" gradient with a check. */
export function LogoMark() {
  return (
    <span
      aria-hidden
      className="bg-fit flex h-7 w-7 items-center justify-center rounded-[9px] text-on-primary"
    >
      <CheckIcon size={14} />
    </span>
  );
}
