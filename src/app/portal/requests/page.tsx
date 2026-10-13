import Link from "next/link";
import { Empty, PageHeading, Status } from "@/components/shell";
import { prisma } from "@/server/prisma";
import { requireClient } from "@/server/session";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireClient();
  const query = (await searchParams).q?.trim() ?? "";
  const requests = await prisma.serviceRequest.findMany({
    where: {
      accountId: user.accountId,
      ...(query ? { reference: { contains: query, mode: "insensitive" } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { quotations: { orderBy: { version: "desc" }, take: 1 }, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return (
    <>
      <PageHeading title="My requests" action={<Link className="btn btn-primary" href="/portal/requests/new">New service request</Link>} />
      <form className="search-row" method="get">
        <label style={{ flex: 1 }}>Search by reference<input name="q" defaultValue={query} /></label>
        <button className="btn" type="submit">Search</button>
      </form>
      {requests.length === 0 ? <Empty>No requests match.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Request</th><th>Service</th><th>Submitted</th><th>Status</th><th>Quotation</th><th>Payment</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td><Link href={`/portal/requests/${request.id}`}>{request.reference}</Link></td>
                  <td>{request.serviceType ?? "—"}</td>
                  <td>{request.submittedAt?.toISOString().slice(0, 10) ?? "—"}</td>
                  <td><Status value={request.status} /></td>
                  <td>{request.quotations[0] ? <Status value={request.quotations[0].status} /> : "—"}</td>
                  <td>{request.payments[0] ? <Status value={request.payments[0].status} /> : "—"}</td>
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
