import { Empty, PageHeading, Status } from "@/components/shell";
import { prisma } from "@/server/prisma";
import { requireClient } from "@/server/session";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireClient();
  const q = (await searchParams).q?.trim() ?? "";
  const reports = await prisma.report.findMany({
    where: {
      job: { serviceClass: "TECHNICAL_SERVICES", sample: { accountId: user.accountId, origin: "CLIENT_REQUEST" } },
      ...(q ? { certificateNo: { contains: q, mode: "insensitive" } } : {}),
    },
    include: { job: { include: { sample: { include: { request: true } } } } },
    orderBy: { issuedAt: "desc" },
  });
  return (
    <>
      <PageHeading title="Reports and certificates" />
      <form className="search-row" method="get">
        <label style={{ flex: 1 }}>Certificate number<input name="q" defaultValue={q} /></label>
        <button className="btn" type="submit">Search</button>
      </form>
      {reports.length === 0 ? <Empty>No reports have been issued to this account. Draft laboratory records are not shown.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Number</th><th>Request</th><th>Status</th><th>Issued</th><th></th></tr></thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>{report.certificateNo}/{String(report.sampleIndex).padStart(3, "0")}</td>
                  <td>{report.job.sample.request?.reference ?? "—"}</td>
                  <td><Status value={report.status} /></td>
                  <td>{report.issuedAt.toISOString().slice(0, 10)}</td>
                  <td><a href={`/files/reports/${report.id}`}>Download</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
