/** V2 brand mark: a signal "node" glyph on a lime tile. */
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        <path d="M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
      </svg>
    </span>
  );
}
