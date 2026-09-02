import { NavLink } from "react-router-dom";

const TABS = [
  {
    to: "/",
    label: "Nearby",
    end: true,
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    to: "/map",
    label: "Map",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
        <path d="M9 3v15" />
        <path d="M15 6v15" />
      </svg>
    ),
  },
  {
    to: "/friends",
    label: "Friends",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
  {
    to: "/me",
    label: "Me",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
];

export default function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 grid grid-cols-4 border-t border-border bg-card px-1.5 pt-2 pb-4">
      {TABS.map(({ to, label, end, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-[11px] tracking-wide ${
              isActive ? "text-forest" : "text-ink-faint"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className={isActive ? "stroke-forest" : "stroke-ink-faint"}>{icon}</span>
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
