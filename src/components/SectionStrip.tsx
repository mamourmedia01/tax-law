import { useLocation } from "react-router-dom";
import { sectionForPath } from "../lib/sections";

// A thin colour bar pinned to the top of the screen that changes per section, so the
// part of the app you're in is obvious at a glance (works with the matching bottom-nav
// accent). Sits above sticky headers.
export function SectionStrip() {
  const { pathname } = useLocation();
  const section = sectionForPath(pathname);
  return (
    <div
      aria-hidden
      className={`fixed inset-x-0 top-0 z-40 mx-auto h-1 max-w-app transition-colors duration-300 ${section.strip}`}
    />
  );
}
