// The Fable+ app mark — teal rounded square with the off-white interlocking cross.
export function Mark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const r = size * 0.22;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Fable+"
    >
      <defs>
        <linearGradient id="markGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#759EA8" />
          <stop offset="100%" stopColor="#4E7A85" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx={r * 100 / size} fill="url(#markGrad)" />
      {/* interlocking cross: two offset rounded bars in off-white */}
      <rect x="42" y="20" width="16" height="60" rx="8" fill="#F2F4F4" />
      <rect x="20" y="42" width="60" height="16" rx="8" fill="#F2F4F4" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-bold ${className}`}>
      <Mark size={28} />
      <span className="text-[20px] tracking-tight text-ink">
        Fable<span className="text-teal-600">+</span>
      </span>
    </span>
  );
}
