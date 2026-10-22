import Link from "next/link";
import { Empty, PageHeading, Status } from "@/components/shell";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const q = (await searchParams).q?.trim() ?? "";
  const jobs = await prisma.job.findMany({
    where: q ? { jobNo: { contains: q, mode: "insensitive" } } : {},
    include: { sample: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeading title="Work orders" />
      <form className="search-row" method="get">
        <label style={{ flex: 1 }}>Job number<input name="q" defaultValue={q} /></label>
        <button className="btn" type="submit">Search</button>
      </form>
      {jobs.length === 0 ? <Empty>No work orders.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Job</th><th>Sample</th><th>Class</th><th>Status</th></tr></thead>
            <tbody>{jobs.map((job) => <tr key={job.id}><td><Link href={`/internal/jobs/${job.id}`}>{job.jobNo}</Link></td><td>{job.sample.description}</td><td>{job.serviceClass.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</td><td><Status value={job.status} /></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
