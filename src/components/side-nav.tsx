"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SideNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Application">
      {items.map((item) => {
        const matches =
          pathname === item.href ||
          (item.href !== "/portal" && item.href !== "/internal" && (pathname === item.href || pathname.startsWith(`${item.href}/`)));
        const longerMatch = items.some(
          (other) =>
            other.href.length > item.href.length &&
            (pathname === other.href || pathname.startsWith(`${other.href}/`)),
        );
        const current = matches && !longerMatch;
        return (
          <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
