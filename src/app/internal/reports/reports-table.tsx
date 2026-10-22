import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { formatDate, humanize } from "@/lib/format";
import { Empty, Status } from "@/components/shell";

export const reportListInclude = {
  job: {
    select: {
      id: true,
      jobNo: true,
      sample: {
        select: {
          description: true,
          brandName: true,
          lotNo: true,
          request: { select: { id: true, reference: true, clientName: true, accountId: true } },
        },
      },
    },
  },
} satisfies Prisma.ReportInclude;

export type ReportListRow = Prisma.ReportGetPayload<{ include: typeof reportListInclude }>;

export function reportNumber(report: { certificateNo: string; sampleIndex: number }) {
  return `${report.certificateNo}/${String(report.sampleIndex).padStart(3, "0")}`;
}

export function reportsHref(params: { filter?: string; lab?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.filter) search.set("filter", params.filter);
  if (params.lab) search.set("lab", params.lab);
  if (params.q) search.set("q", params.q);
  const value = search.toString();
  return value ? `/internal/reports?${value}` : "/internal/reports";
}

export function ReportStatus({ value }: { value: string }) {
  if (value === "ISSUED") return <span className="chip chip-good">Issued</span>;
  return <Status value={value} />;
}

export function IssuedDocumentsTable({
  reports,
  issuers,
  empty,
  linkRequests,
}: {
  reports: ReportListRow[];
  issuers: Record<string, string>;
  empty: string;
  linkRequests?: boolean;
}) {
  if (reports.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Document</th>
            <th>Sample</th>
            <th>Client</th>
            <th>Lab</th>
            <th>Issued</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const request = report.job.sample.request;
            return (
              <tr key={report.id}>
                <td>
                  <Link href={`/internal/reports/${report.id}`}>{reportNumber(report)}</Link>
                  <small className="cell-sub">
                    {humanize(report.kind)}
                    {report.revision > 1 ? ` · Revision ${report.revision}` : ""}
                  </small>
                </td>
                <td>
                  {report.job.sample.description}
                  {(report.job.sample.brandName || report.job.sample.lotNo) && (
                    <small className="cell-sub">{[report.job.sample.brandName, report.job.sample.lotNo].filter(Boolean).join(" · ")}</small>
                  )}
                </td>
                <td>
                  {request?.clientName || <span className="facts-none">—</span>}
                  {request && (
                    <small className="cell-sub">
                      {linkRequests ? <Link href={`/internal/requests/${request.id}`}>{request.reference}</Link> : request.reference}
                    </small>
                  )}
                </td>
                <td>{report.lab}</td>
                <td>
                  {formatDate(report.issuedAt)}
                  {issuers[report.issuedById] && <small className="cell-sub">{issuers[report.issuedById]}</small>}
                </td>
                <td><ReportStatus value={report.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
