'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  {
    href: '/',
    label: 'החג',
    path: 'M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  },
  {
    href: '/families',
    label: 'המשפחות',
    path: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 19c0-2.8 2.7-5 6-5s6 2.2 6 5M16 14c2.8 0 5 1.8 5 4',
  },
  {
    href: '/occasions',
    label: 'מועדים',
    // A star, not another calendar: two calendars side by side read as one tab.
    path: 'M12 4.2l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 9.7l5.2-.8L12 4.2Z',
  },
  {
    href: '/history',
    label: 'היסטוריה',
    path: 'M12 7v5l3 2M12 21a9 9 0 1 0-9-9',
  },
];

/** A real tab bar: these are whole screens, not footnotes. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex w-full max-w-md">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-xs font-bold transition ${
                  active ? 'text-brand' : 'text-muted'
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                  <path
                    d={item.path}
                    stroke="currentColor"
                    strokeWidth={active ? 2.2 : 1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
