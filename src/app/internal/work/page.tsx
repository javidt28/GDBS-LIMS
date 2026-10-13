import Link from "next/link";
import { Empty, PageHeading, Status } from "@/components/shell";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";

export default async function WorkPage() {
  const staff = await requireStaff();
  const mine = staff.role === "ANALYST" || staff.role === "TECHNICAL_OFFICER";
  const jobs = await prisma.job.findMany({
    where: mine ? { assigneeId: staff.id } : { status: { notIn: ["REPORT_ISSUED", "CANCELLED"] } },
    include: { sample: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return (
    <>
      <PageHeading title="My work" />
      {jobs.length === 0 ? <Empty>No work orders are assigned.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Job</th><th>Sample</th><th>Status</th></tr></thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td><Link href={`/internal/jobs/${job.id}`}>{job.jobNo}</Link></td>
                  <td>{job.sample.description}</td>
                  <td><Status value={job.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
