import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading, Status } from "@/components/shell";
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
  return (
    <>
      <PageHeading title={number} crumbs={[{ href: "/portal/reports", label: "Reports and certificates" }]} action={<Status value={report.status} />} />
      <p>{report.job.sample.request?.reference ?? "—"} · {report.job.sample.description}</p>
      <p><a className="btn btn-primary" href={`/files/reports/${report.id}`}>Download PDF</a></p>
      <p className="help"><Link href="/portal/reports">All reports</Link></p>
    </>
  );
}
