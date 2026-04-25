// Lightweight stroke-only SVG icons for the mobile bottom nav.
// Designed at 24×24 viewbox; pass className to control size/color.

type IconProps = { className?: string };

export function HomeIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function WalletIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function ShopIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 8h17l-1 3.5a3 3 0 0 1-5.8 0 3 3 0 0 1-5.8 0 3 3 0 0 1-5.4-1.2z" />
      <path d="M5 11.5V20h14v-8.5" />
      <path d="M10 20v-4h4v4" />
    </svg>
  );
}

export function TrophyIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
      <path d="M4 6h3v2a3 3 0 0 1-3 0z" />
      <path d="M17 6h3v2a3 3 0 0 1-3 0z" />
      <path d="M9 13v2h6v-2" />
      <path d="M8 20h8" />
      <path d="M10 15v5" />
      <path d="M14 15v5" />
    </svg>
  );
}

export function GiftIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="9" width="18" height="12" rx="1.5" />
      <path d="M3 13h18" />
      <path d="M12 9v12" />
      <path d="M12 9c-1.5-2.5-4.5-3-5.5-1.5S7 9 12 9zM12 9c1.5-2.5 4.5-3 5.5-1.5S17 9 12 9z" />
    </svg>
  );
}

export function MagnifyIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4-4" />
      <path d="M11 8a3 3 0 0 0-3 3" />
    </svg>
  );
}

export function LeafIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 20c7 0 13-4 16-14-8 0-14 4-16 14z" />
      <path d="M5 19c3-4 7-7 12-9" />
    </svg>
  );
}

export function MuseumIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 10 12 4l9 6" />
      <path d="M5 10v10h14V10" />
      <path d="M8 20v-6M12 20v-6M16 20v-6" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function UserIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

export function BookIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 5a2 2 0 0 1 2-2h4a3 3 0 0 1 2 1 3 3 0 0 1 2-1h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4a2 2 0 0 0-2 2 2 2 0 0 0-2-2H6a2 2 0 0 1-2-2z" />
      <path d="M12 4v16" />
    </svg>
  );
}

export function LogoutIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h11" />
    </svg>
  );
}
