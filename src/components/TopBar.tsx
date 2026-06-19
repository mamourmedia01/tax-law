import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

export function TopBar({
  title,
  right,
  transparent = false,
}: {
  title?: string;
  right?: React.ReactNode;
  transparent?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <header
      className={`sticky top-0 z-20 flex h-14 items-center justify-between px-4 ${
        transparent ? "" : "border-b border-grey-100 bg-canvas/90 backdrop-blur"
      }`}
    >
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Go back"
        className={`focusable grid h-10 w-10 place-items-center rounded-full ${
          transparent ? "bg-white/90 text-ink shadow-card backdrop-blur" : "text-ink hover:bg-grey-100"
        }`}
      >
        <ChevronLeft size={22} />
      </button>
      {title && <h1 className="t-h3 absolute left-1/2 -translate-x-1/2">{title}</h1>}
      <div className="grid h-10 min-w-10 place-items-center">{right}</div>
    </header>
  );
}
