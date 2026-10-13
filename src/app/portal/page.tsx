import Link from "next/link";
import { redirect } from "next/navigation";
import { Banner, Empty, PageHeading, Status } from "@/components/shell";
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
  return (
    <>
      <PageHeading title="Dashboard" action={<Link className="btn btn-primary" href="/portal/requests/new">New service request</Link>} />
      <Banner error={query.error} />
      <div className="metrics">
        <div className="metric"><span>Active requests</span><strong>{active}</strong></div>
        <div className="metric"><span>Drafts</span><strong>{drafts}</strong></div>
        <div className="metric"><span>Awaiting your action</span><strong>{returned}</strong></div>
        <div className="metric"><span>Samples in testing</span><strong>{received}</strong></div>
        <div className="metric"><span>Issued reports</span><strong>{reports}</strong></div>
        <div className="metric"><span>Unread notifications</span><strong>{notifications}</strong></div>
      </div>
      <h2>Recent requests</h2>
      {recent.length === 0 ? <Empty>No requests yet.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Reference</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {recent.map((request) => (
                <tr key={request.id}>
                  <td><Link href={`/portal/requests/${request.id}`}>{request.reference}</Link></td>
                  <td><Status value={request.status} /></td>
                  <td>{request.updatedAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
