import { NavLink } from "react-router-dom";
import { CalendarCheck, Home, Search, User } from "lucide-react";
import { SECTIONS } from "../lib/sections";

const TABS = [
  { to: "/", label: "Home", Icon: Home, end: true, section: SECTIONS.home },
  { to: "/search", label: "Search", Icon: Search, end: false, section: SECTIONS.search },
  { to: "/bookings", label: "Bookings", Icon: CalendarCheck, end: false, section: SECTIONS.bookings },
  { to: "/profile", label: "Profile", Icon: User, end: false, section: SECTIONS.profile },
];

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2"
      aria-label="Primary"
    >
      <div className="flex items-center justify-around rounded-card bg-white px-2 py-2 shadow-nav">
        {TABS.map(({ to, label, Icon, end, section }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="focusable group flex flex-1 flex-col items-center gap-1 rounded-btn py-1.5"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`grid h-9 w-12 place-items-center rounded-full transition-colors ${
                    isActive ? section.navActivePill : "text-grey-400"
                  }`}
                >
                  <Icon size={21} strokeWidth={isActive ? 2.3 : 2} />
                </span>
                <span
                  className={`text-[11px] font-medium ${
                    isActive ? section.navActiveLabel : "text-grey-400"
                  }`}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
