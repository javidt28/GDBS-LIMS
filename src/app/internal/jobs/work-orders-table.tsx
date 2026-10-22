import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { formatDate, humanize } from "@/lib/format";
import { Empty, Status } from "@/components/shell";

export const OPEN_JOB_STATUSES = ["CREATED", "IN_ANALYSIS", "RESULTS_ENTERED", "AWAITING_VERIFICATION"] as const;

export const jobListInclude = {
  sample: {
    include: {
      request: { select: { id: true, reference: true, clientName: true } },
    },
  },
  analyses: { select: { id: true, result: { select: { id: true } } } },
  reports: {
    where: { status: "ISSUED" as const },
    select: { certificateNo: true, sampleIndex: true },
    orderBy: { revision: "desc" as const },
    take: 1,
  },
} satisfies Prisma.JobInclude;

export type JobListRow = Prisma.JobGetPayload<{ include: typeof jobListInclude }>;

export function jobsHref(params: { status?: string; lab?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.lab) search.set("lab", params.lab);
  if (params.q) search.set("q", params.q);
  const value = search.toString();
  return value ? `/internal/jobs?${value}` : "/internal/jobs";
}

export function WorkOrdersTable({
  jobs,
  assignees,
  empty,
}: {
  jobs: JobListRow[];
  assignees: Record<string, string>;
  empty: string;
}) {
  if (jobs.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Work order</th>
            <th>Sample</th>
            <th>Client</th>
            <th>Lab</th>
            <th>Results</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const request = job.sample.request;
            const withResult = job.analyses.filter((analysis) => analysis.result).length;
            const issued = job.reports[0];
            const client = request?.clientName || (job.sample.origin === "CLIENT_REQUEST" ? null : humanize(job.sample.origin));
            return (
              <tr key={job.id}>
                <td>
                  <Link href={`/internal/jobs/${job.id}`}>{job.jobNo}</Link>
                  <small className="cell-sub">
                    {formatDate(job.jobDate)}
                    {job.assigneeId && assignees[job.assigneeId] ? ` · ${assignees[job.assigneeId]}` : ""}
                  </small>
                </td>
                <td>
                  {job.sample.description}
                  {(job.sample.brandName || job.sample.lotNo) && (
                    <small className="cell-sub">{[job.sample.brandName, job.sample.lotNo].filter(Boolean).join(" · ")}</small>
                  )}
                </td>
                <td>
                  {client || <span className="facts-none">—</span>}
                  {request && (
                    <small className="cell-sub">
                      <Link href={`/internal/requests/${request.id}`}>{request.reference}</Link>
                    </small>
                  )}
                </td>
                <td>{job.lab}</td>
                <td>
                  {job.analyses.length === 0 ? (
                    <span className="facts-none">No analyses</span>
                  ) : (
                    <>
                      {withResult} of {job.analyses.length}
                      {issued && (
                        <small className="cell-sub">
                          {issued.certificateNo}/{String(issued.sampleIndex).padStart(3, "0")}
                        </small>
                      )}
                    </>
                  )}
                </td>
                <td><Status value={job.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
