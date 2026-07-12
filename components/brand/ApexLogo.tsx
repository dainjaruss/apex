type ApexLogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
};

const SIZE = { sm: 32, md: 40, lg: 56, xl: 72 } as const;

/**
 * APEX mark — military rank chevrons beneath a line-officer star,
 * colored in Navy red / gold / blue. Flat vector, scales cleanly.
 */
export default function ApexLogo({
  className = "",
  size = "md",
}: ApexLogoProps) {
  const px = SIZE[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="APEX logo"
    >
      <defs>
        <linearGradient
          id="apex-star"
          x1="24"
          y1="2.5"
          x2="24"
          y2="12.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient
          id="apex-chev-red"
          x1="24"
          y1="15"
          x2="24"
          y2="29.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#b91c1c" />
        </linearGradient>
        <linearGradient
          id="apex-chev-gold"
          x1="24"
          y1="24"
          x2="24"
          y2="38.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient
          id="apex-chev-blue"
          x1="24"
          y1="33"
          x2="24"
          y2="47.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>

      {/* Line-officer star at the peak */}
      <path
        d="M24 2.5 L25.35 6.14 L29.23 6.30 L26.19 8.71 L27.23 12.45 L24 10.3 L20.77 12.45 L21.81 8.71 L18.77 6.30 L22.65 6.14 Z"
        fill="url(#apex-star)"
        stroke="#b45309"
        strokeWidth="0.4"
        strokeLinejoin="round"
      />

      {/* Rank chevrons — red / gold / blue */}
      <path
        d="M10 23.5 L24 15 L38 23.5 L38 29.5 L24 21 L10 29.5 Z"
        fill="url(#apex-chev-red)"
      />
      <path
        d="M10 32.5 L24 24 L38 32.5 L38 38.5 L24 30 L10 38.5 Z"
        fill="url(#apex-chev-gold)"
      />
      <path
        d="M10 41.5 L24 33 L38 41.5 L38 47.5 L24 39 L10 47.5 Z"
        fill="url(#apex-chev-blue)"
      />
    </svg>
  );
}
