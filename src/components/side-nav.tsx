"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; group?: string };

const ICONS: Record<string, string> = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  work: "M9 4h6v3H9zM5 6h14v14H5zM9 12l2 2 4-4",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  inbox: "M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2h4l1-2h5",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c1.8.8 3 2.6 3 4.5",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 15h9",
  file: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  quote: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  tag: "M3 12V4h8l10 10-8 8zM7.5 8.5h.01",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z",
  hash: "M9 4L7 20M17 4l-2 16M4 9h16M3 15h16",
  history: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4M12 8v4l3 2",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  plus: "M12 5v14M5 12h14",
  sample: "M9 3h6M10 3v13a2 2 0 0 0 4 0V3M10 9h4",
  account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8",
};

function iconFor(href: string) {
  const path = href.replace(/^\/(internal|portal)/, "") || "/";
  if (path === "/") return ICONS.dashboard;
  if (path.startsWith("/work")) return ICONS.work;
  if (path.startsWith("/notifications")) return ICONS.bell;
  if (path.startsWith("/requests/new")) return ICONS.plus;
  if (path.startsWith("/requests")) return ICONS.inbox;
  if (path.startsWith("/clients") || path.startsWith("/admin/users")) return ICONS.users;
  if (path.startsWith("/jobs")) return ICONS.flask;
  if (path.startsWith("/samples")) return ICONS.sample;
  if (path.startsWith("/reports")) return ICONS.file;
  if (path.startsWith("/quotations")) return ICONS.quote;
  if (path.startsWith("/payments")) return ICONS.card;
  if (path.startsWith("/fees")) return ICONS.tag;
  if (path.startsWith("/admin/numbering")) return ICONS.hash;
  if (path.startsWith("/admin/audit")) return ICONS.history;
  if (path.startsWith("/admin/settings")) return ICONS.gear;
  if (path.startsWith("/account")) return ICONS.account;
  return ICONS.shield;
}

export function SideNav({ items }: { items: Item[] }) {
  const pathname = usePathname();
  const groups: { name?: string; items: Item[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  return (
    <nav aria-label="Application" className="side-nav">
      {groups.map((group) => (
        <div key={group.name ?? "main"} className="side-nav-group">
          {group.name && <p className="side-nav-heading">{group.name}</p>}
          {group.items.map((item) => {
            const matches =
              pathname === item.href ||
              (item.href !== "/portal" && item.href !== "/internal" && pathname.startsWith(`${item.href}/`));
            const longerMatch = items.some(
              (other) =>
                other.href.length > item.href.length &&
                (pathname === other.href || pathname.startsWith(`${other.href}/`)),
            );
            const current = matches && !longerMatch;
            return (
              <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={iconFor(item.href)} />
                </svg>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
