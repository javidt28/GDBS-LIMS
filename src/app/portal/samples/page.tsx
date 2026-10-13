import Link from "next/link";
import { Empty, PageHeading, Status } from "@/components/shell";
import { prisma } from "@/server/prisma";
import { requireClient } from "@/server/session";

export default async function SamplesPage() {
  const user = await requireClient();
  const samples = await prisma.sample.findMany({
    where: { accountId: user.accountId, origin: "CLIENT_REQUEST", requestId: { not: null } },
    include: { request: true, jobs: { where: { serviceClass: "TECHNICAL_SERVICES" }, include: { analyses: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeading title="My samples" />
      {samples.length === 0 ? <Empty>No samples are linked to your requests.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Description</th><th>Request</th><th>Received</th><th>Work</th></tr></thead>
            <tbody>
              {samples.map((sample) => (
                <tr key={sample.id}>
                  <td>{sample.description}</td>
                  <td>{sample.request ? <Link href={`/portal/requests/${sample.request.id}`}>{sample.request.reference}</Link> : "—"}</td>
                  <td>{sample.receivedAt ? sample.receivedAt.toISOString().slice(0, 16) : "Not received"}</td>
                  <td>{sample.jobs[0] ? <Status value={sample.jobs[0].status} /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
