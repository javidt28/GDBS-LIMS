import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { Card, Empty, Facts, PageHeading } from "@/components/shell";
import { can } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";
import { reportNumber, ReportStatus } from "../reports-table";

export default async function IssuedDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "reports.read")) return <Empty>You do not have permission to view issued documents.</Empty>;
  const { id } = await params;
  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      job: {
        include: {
          sample: { include: { request: true } },
        },
      },
      revisionOf: { select: { id: true, certificateNo: true, sampleIndex: true, revision: true, status: true } },
      revisions: {
        select: { id: true, certificateNo: true, sampleIndex: true, revision: true, status: true, issuedAt: true },
        orderBy: { revision: "desc" },
      },
    },
  });
  if (!report) notFound();
  const issuer = await prisma.staffUser.findUnique({
    where: { id: report.issuedById },
    select: { fullName: true },
  });
  const number = reportNumber(report);
  const request = report.job.sample.request;
  const sample = report.job.sample;
  const readJobs = can(staff.role, "jobs.read");
  const readRequests = can(staff.role, "requests.read");
  const readClients = can(staff.role, "clients.read");

  return (
    <>
      <PageHeading
        title={number}
        crumbs={[{ href: "/internal/reports", label: "Issued documents" }]}
        meta={<>{humanize(report.kind)} · {sample.description}</>}
        action={<ReportStatus value={report.status} />}
      />

      <div className="detail-grid">
        <div className="detail-main">
          <Card title="Document">
            <Facts
              items={[
                ["Document type", humanize(report.kind)],
                ["Certificate number", number],
                ["Revision", String(report.revision)],
                ["Laboratory", report.lab],
                ["Issued", formatDateTime(report.issuedAt)],
                ["Issued by", issuer?.fullName],
                ...(report.supersededAt ? [["Superseded", formatDateTime(report.supersededAt)] as [string, string]] : []),
              ]}
            />
          </Card>

          <Card title="Sample and client">
            <Facts
              items={[
                ["Client", request?.clientName && readClients && request.accountId
                  ? <Link href={`/internal/clients/${request.accountId}`}>{request.clientName}</Link>
                  : request?.clientName],
                ["Request", request && (readRequests
                  ? <Link href={`/internal/requests/${request.id}`}>{request.reference}</Link>
                  : request.reference)],
                ["Sample", sample.description],
                ["Brand", sample.brandName],
                ["Lot number", sample.lotNo],
                ["Size or quantity", sample.sizeQuantity, true],
              ]}
            />
          </Card>

          {(report.revisionOf || report.revisions.length > 0) && (
            <Card title="Revisions">
              <ul className="file-list">
                {report.revisions.map((revision) => (
                  <li key={revision.id}>
                    <Link href={`/internal/reports/${revision.id}`}>{reportNumber(revision)}</Link>
                    <span className="file-meta">Revision {revision.revision} · {formatDate(revision.issuedAt)}</span>
                    <ReportStatus value={revision.status} />
                  </li>
                ))}
                {report.revisionOf && (
                  <li>
                    <Link href={`/internal/reports/${report.revisionOf.id}`}>{reportNumber(report.revisionOf)}</Link>
                    <span className="file-meta">Previous · Revision {report.revisionOf.revision}</span>
                    <ReportStatus value={report.revisionOf.status} />
                  </li>
                )}
              </ul>
            </Card>
          )}
        </div>

        <aside className="detail-side">
          <Card title="Official PDF" className="card-accent">
            <p className="card-note">This file is the issued copy. Opening a correction on the work order leaves this file unchanged.</p>
            <a className="btn btn-primary btn-block" href={`/files/reports/${report.id}`}>Download PDF</a>
          </Card>

          <Card title="Work order">
            <Facts
              items={[
                ["Work order", readJobs
                  ? <Link href={`/internal/jobs/${report.job.id}`}>{report.job.jobNo}</Link>
                  : report.job.jobNo],
                ["Job date", formatDate(report.job.jobDate)],
                ["Laboratory", report.job.lab],
              ]}
            />
          </Card>
        </aside>
      </div>
    </>
  );
}
