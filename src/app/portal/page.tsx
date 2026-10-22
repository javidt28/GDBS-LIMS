import Link from "next/link";
import { redirect } from "next/navigation";
import { Banner, Status } from "@/components/shell";
import { prisma } from "@/server/prisma";
import { requireClient } from "@/server/session";

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireClient();
  if (!user.account.profileCompletedAt) redirect("/portal/onboarding");
  const query = await searchParams;
  const accountId = user.accountId;
  const [active, drafts, returned, received, reports, notifications] = await Promise.all([
    prisma.serviceRequest.count({ where: { accountId, status: { in: ["SUBMITTED", "ACKNOWLEDGED"] } } }),
    prisma.serviceRequest.count({ where: { accountId, status: "DRAFT" } }),
    prisma.serviceRequest.count({ where: { accountId, status: "RETURNED" } }),
    prisma.sample.count({ where: { accountId, origin: "CLIENT_REQUEST", receivedAt: { not: null }, jobs: { some: { serviceClass: "TECHNICAL_SERVICES", status: { not: "REPORT_ISSUED" } } } } }),
    prisma.report.count({ where: { status: "ISSUED", job: { serviceClass: "TECHNICAL_SERVICES", sample: { accountId, origin: "CLIENT_REQUEST" } } } }),
    prisma.notification.count({ where: { clientUserId: user.id, readAt: null } }),
  ]);
  const recent = await prisma.serviceRequest.findMany({
    where: { accountId },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  const cards = [
    { label: "Active requests", value: active, href: "/portal/requests", tone: "blue" },
    { label: "Drafts", value: drafts, href: "/portal/requests", tone: "violet" },
    { label: "Awaiting your action", value: returned, href: "/portal/requests", tone: "amber" },
    { label: "Samples in testing", value: received, href: "/portal/samples", tone: "teal" },
    { label: "Issued reports", value: reports, href: "/portal/reports", tone: "green" },
    { label: "Unread notifications", value: notifications, href: "/portal/notifications", tone: "blue" },
  ];
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Grenada" }).format(new Date());

  return (
    <>
      <div className="dash-hero">
        <div>
          <p className="dash-date">{today}</p>
          <h1>Welcome, {user.fullName.split(" ")[0]}</h1>
          <p className="dash-sub">Track your service requests, samples, and issued reports.</p>
        </div>
        <Link className="btn btn-primary" href="/portal/requests/new">New service request</Link>
      </div>
      <Banner error={query.error} />

      <div className="stat-grid">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className={`stat-card stat-${card.tone}`}>
            <span className="stat-label">{card.label}</span>
            <strong className="stat-value">{card.value}</strong>
            <span className="stat-link">View →</span>
          </Link>
        ))}
      </div>

      <section className="card">
        <header className="card-head">
          <h2>Recent requests</h2>
          <Link href="/portal/requests">All requests</Link>
        </header>
        {recent.length === 0 ? (
          <p className="card-empty">No requests yet.</p>
        ) : (
          <ul className="list">
            {recent.map((request) => (
              <li key={request.id}>
                <Link href={`/portal/requests/${request.id}`}>
                  <span>
                    <strong>{request.reference}</strong>
                    <small>Updated {request.updatedAt.toLocaleDateString("en-GB", { timeZone: "America/Grenada" })}</small>
                  </span>
                  <Status value={request.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
