import { useRef, useState } from "react";
import { ImageTile } from "./ImageTile";

// "The Reveal" — the signature draggable before/after slider from the brand spec.
export function Reveal({
  before,
  after,
  label,
  className = "",
}: {
  before: string;
  after: string;
  label?: string;
  className?: string;
}) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);

  function move(clientX: number) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }

  return (
    <div
      ref={ref}
      className={`relative select-none overflow-hidden rounded-img ${className}`}
      onPointerMove={(e) => e.buttons === 1 && move(e.clientX)}
      onPointerDown={(e) => move(e.clientX)}
    >
      <ImageTile seed={after} className="h-full w-full" label={`After: ${label ?? ""}`} />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
        <ImageTile
          seed={before}
          className="h-full"
          label={`Before: ${label ?? ""}`}
        />
        <span className="absolute left-2 top-2 badge bg-ink/60 text-white">Before</span>
      </div>
      <span className="absolute right-2 top-2 badge bg-teal-700 text-white">After</span>

      {/* handle */}
      <div className="absolute inset-y-0" style={{ left: `calc(${pos}% - 1px)` }}>
        <div className="h-full w-0.5 bg-white/90" />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label={`Reveal slider${label ? ` for ${label}` : ""}`}
        className="absolute inset-x-0 bottom-0 m-0 h-12 w-full cursor-ew-resize appearance-none bg-transparent focusable"
        style={{ WebkitAppearance: "none" }}
      />
      <div
        className="pointer-events-none absolute top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-teal-700 shadow-float"
        style={{ left: `calc(${pos}% - 18px)` }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 7-5 5 5 5" />
          <path d="m15 7 5 5-5 5" />
        </svg>
      </div>
    </div>
  );
}
