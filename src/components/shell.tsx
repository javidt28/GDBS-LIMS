import Link from "next/link";
import { signOutAction, staffSignOutAction } from "@/server/actions";
import { SideNav } from "./side-nav";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function AppFrame({
  title,
  items,
  children,
  accountName,
  accountRole,
  realm,
}: {
  title: string;
  items: { href: string; label: string; group?: string }[];
  children: React.ReactNode;
  accountName: string;
  accountRole?: string;
  realm: "client" | "staff";
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href={realm === "client" ? "/portal" : "/internal"} className="sidebar-brand">
          <span className="sidebar-logo"><img src="/brand/gdbs-logo.png" alt="" /></span>
          <span>
            <strong>Grenada Bureau of Standards</strong>
            <small>{title}</small>
          </span>
        </Link>
        <SideNav items={items} />
        <div className="sidebar-account">
          <span className="avatar" aria-hidden="true">{initials(accountName)}</span>
          <span className="sidebar-account-text">
            <strong>{accountName}</strong>
            {accountRole && <small>{accountRole}</small>}
          </span>
          <form action={realm === "client" ? signOutAction : staffSignOutAction}>
            <button className="sidebar-signout" type="submit" title="Sign out">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>
              <span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </aside>
      <div className="workspace">
        <main id="content" className="page">{children}</main>
      </div>
    </div>
  );
}

export function PageHeading({
  title,
  crumbs,
  action,
  meta,
}: {
  title: string;
  crumbs?: { href: string; label: string }[];
  action?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {crumbs && crumbs.length > 0 && (
          <div className="crumbs">
            {crumbs.map((crumb, index) => (
              <span key={crumb.href}>
                {index > 0 && " / "}
                <Link href={crumb.href}>{crumb.label}</Link>
              </span>
            ))}
          </div>
        )}
        <h1 className="page-title" style={{ fontSize: "1.7rem" }}>{title}</h1>
        {meta && <p className="page-meta">{meta}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`}>
      {title && (
        <header className="card-head">
          <h2>{title}</h2>
          {action}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Facts({ items }: { items: [label: string, value: React.ReactNode, wide?: boolean][] }) {
  return (
    <dl className="facts">
      {items.map(([label, value, wide]) => (
        <div key={label} className={wide ? "facts-wide" : undefined}>
          <dt>{label}</dt>
          <dd>{value === null || value === undefined || value === "" ? <span className="facts-none">Not provided</span> : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Status({ value }: { value: string }) {
  const good = ["ACKNOWLEDGED", "COMPLETED", "VERIFIED", "REPORT_ISSUED", "ACCEPTED", "CONFIRMED"].includes(value);
  const bad = ["REJECTED", "CANCELLED", "SUPERSEDED"].includes(value);
  const wait = ["SUBMITTED", "RETURNED", "AWAITING_VERIFICATION", "AWAITING", "REFERENCE_SUBMITTED", "ISSUED", "IN_ANALYSIS", "RESULTS_ENTERED", "ON_HOLD"].includes(value);
  const tone = bad ? "status-bad" : good ? "status-good" : wait ? "status-wait" : "";
  return <span className={`status ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Banner({ error, ok }: { error?: string; ok?: string }) {
  return (
    <>
      {error && <p className="banner-error" role="alert">{error}</p>}
      {ok && <p className="banner-ok">{ok}</p>}
    </>
  );
}
