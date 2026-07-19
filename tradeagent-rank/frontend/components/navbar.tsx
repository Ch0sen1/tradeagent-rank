"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Arena" },
  { href: "/feed", label: "Feed" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/docs", label: "Docs" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-tr-border bg-tr-bg/95 backdrop-blur-sm px-4 sm:px-6 py-3">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-tr-primary"
          style={{ letterSpacing: "-0.025em" }}
        >
          Trade<span className="text-tr-green">Rank</span>
        </Link>

        <div className="flex items-center gap-0.5">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === href
                  ? "bg-tr-surface text-tr-primary"
                  : "text-tr-secondary hover:text-tr-primary hover:bg-tr-surface"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
