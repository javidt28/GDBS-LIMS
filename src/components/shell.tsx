import Link from "next/link";
import { signOutAction, staffSignOutAction } from "@/server/actions";
import { SideNav } from "./side-nav";

export function AppFrame({
  title,
  items,
  children,
  accountLabel,
  realm,
}: {
  title: string;
  items: { href: string; label: string }[];
  children: React.ReactNode;
  accountLabel: string;
  realm: "client" | "staff";
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href={realm === "client" ? "/portal" : "/internal"} className="brand">
          <img src="/brand/gdbs-logo.png" alt="" />
          <strong>{title}</strong>
        </Link>
        <SideNav items={items} />
      </aside>
      <div className="workspace">
        <div className="topbar">
          <span>{accountLabel}</span>
          <form action={realm === "client" ? signOutAction : staffSignOutAction}>
            <button className="btn btn-quiet" type="submit">Sign out</button>
          </form>
        </div>
        <main id="content" className="page">{children}</main>
      </div>
    </div>
  );
}

export function PageHeading({
  title,
  crumbs,
  action,
}: {
  title: string;
  crumbs?: { href: string; label: string }[];
  action?: React.ReactNode;
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
      </div>
      {action}
    </div>
  );
}

export function Status({ value }: { value: string }) {
  const good = ["ACKNOWLEDGED", "COMPLETED", "VERIFIED", "REPORT_ISSUED", "ISSUED", "ACCEPTED", "CONFIRMED"].includes(value);
  const bad = ["REJECTED", "CANCELLED", "SUPERSEDED"].includes(value);
  const wait = ["SUBMITTED", "RETURNED", "AWAITING_VERIFICATION", "AWAITING", "REFERENCE_SUBMITTED", "ISSUED"].includes(value);
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
