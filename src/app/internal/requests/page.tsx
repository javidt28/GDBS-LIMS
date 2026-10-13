import Link from "next/link";
import { Empty, PageHeading, Status } from "@/components/shell";
import { can } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";

export default async function StaffRequestsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "requests.read")) return <Empty>You do not have permission to view requests.</Empty>;
  const query = await searchParams;
  const requests = await prisma.serviceRequest.findMany({
    where: {
      ...(query.status ? { status: query.status as "SUBMITTED" } : {}),
      ...(query.q ? { OR: [{ reference: { contains: query.q, mode: "insensitive" } }, { clientName: { contains: query.q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeading title="Service requests" />
      <form className="search-row" method="get">
        <label>Search<input name="q" defaultValue={query.q ?? ""} /></label>
        <label>Status
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">All</option>
            {["DRAFT", "SUBMITTED", "RETURNED", "REJECTED", "ACKNOWLEDGED", "COMPLETED", "CANCELLED"].map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Filter</button>
      </form>
      {requests.length === 0 ? <Empty>No requests.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Reference</th><th>Client</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td><Link href={`/internal/requests/${request.id}`}>{request.reference}</Link></td>
                  <td>{request.clientName || "—"}</td>
                  <td><Status value={request.status} /></td>
                  <td>{request.submittedAt?.toISOString().slice(0, 10) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
