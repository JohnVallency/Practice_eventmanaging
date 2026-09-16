/**
 * Логотип-монограмма EventLMS: три «строки плана» и акцентная точка-событие.
 */

export function BrandMark(): JSX.Element {
  return (
    <svg
      className="brand-mark__glyph"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 6h11M3 12h7M3 18h11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="18.5" cy="12" r="3" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1" fill="#c0402a" />
    </svg>
  );
}
