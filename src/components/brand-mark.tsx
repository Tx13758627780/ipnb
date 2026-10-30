/** ipnb logo: lime tile with "ip" lettering whose i-dot is a linked network node. */
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <rect width="64" height="64" rx="15" fill="#a3e635" />
        <g fill="#09090b">
          <rect x="13" y="27" width="8.5" height="23" rx="4.25" />
          <rect x="27" y="27" width="8.5" height="30" rx="4.25" />
          <circle cx="17.25" cy="16.5" r="6" />
          <circle cx="49" cy="10.5" r="3.6" />
        </g>
        <circle
          cx="42.5"
          cy="38.5"
          r="9"
          fill="none"
          stroke="#09090b"
          strokeWidth="8"
        />
        <circle cx="17.25" cy="16.5" r="2.4" fill="#22d3ee" />
        <path
          d="M23 15.5 L46 11"
          stroke="#09090b"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
