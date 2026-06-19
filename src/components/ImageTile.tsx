// Offline, deterministic "photo" tiles — a teal-leaning gradient derived from a hex seed,
// so the app renders fully without any network image dependency.
function seedColour(seed: string): string {
  const hex = seed.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).padEnd(6, "8");
  return `#${hex}`;
}

export function ImageTile({
  seed,
  className = "",
  label,
  rounded = "rounded-img",
}: {
  seed: string;
  className?: string;
  label?: string;
  rounded?: string;
}) {
  const c = seedColour(seed);
  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${c} 0%, #213C43 125%)` }}
      role="img"
      aria-label={label ?? "Service photo"}
    >
      {/* soft highlight to evoke a clean, wet, glossy surface */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(120% 60% at 20% 0%, rgba(255,255,255,0.35), rgba(255,255,255,0) 60%)",
        }}
      />
      <div
        className="pointer-events-none absolute -inset-x-10 top-1/3 h-16 rotate-[-18deg] opacity-25 blur-md"
        style={{ background: "linear-gradient(90deg, transparent, #ffffff, transparent)" }}
      />
    </div>
  );
}
