import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime, humanize } from "@/lib/format";
import { Card, Facts, PageHeading, Status } from "@/components/shell";
import { prisma } from "@/server/prisma";
import { requireClient } from "@/server/session";

export default async function ClientReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const report = await prisma.report.findFirst({
    where: {
      id,
      job: { serviceClass: "TECHNICAL_SERVICES", sample: { accountId: user.accountId, origin: "CLIENT_REQUEST" } },
    },
    include: { job: { include: { sample: { include: { request: true } } } } },
  });
  if (!report) notFound();
  const number = `${report.certificateNo}/${String(report.sampleIndex).padStart(3, "0")}`;
  const request = report.job.sample.request;
  return (
    <>
      <PageHeading
        title={number}
        crumbs={[{ href: "/portal/reports", label: "Reports and certificates" }]}
        meta={humanize(report.kind)}
        action={<Status value={report.status} />}
      />
      <div className="detail-grid">
        <div className="detail-main">
          <Card title="Document details">
            <Facts
              items={[
                ["Document type", humanize(report.kind)],
                ["Number", number],
                ["Revision", String(report.revision)],
                ["Issued", formatDateTime(report.issuedAt)],
                ["Request", request && <Link href={`/portal/requests/${request.id}`}>{request.reference}</Link>],
                ["Sample", report.job.sample.description],
              ]}
            />
          </Card>
        </div>
        <aside className="detail-side">
          <Card title="Download" className="card-accent">
            <p className="card-note">The PDF is the official issued copy.</p>
            <a className="btn btn-primary btn-block" href={`/files/reports/${report.id}`}>Download PDF</a>
          </Card>
        </aside>
      </div>
    </>
  );
}
