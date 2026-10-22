import Link from "next/link";
import type { LabCode, Prisma, ReportKind, ReportStatus } from "@prisma/client";
import { Empty, PageHeading } from "@/components/shell";
import { can } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";
import { IssuedDocumentsTable, reportListInclude, reportsHref } from "./reports-table";

const LABS: LabCode[] = ["AL", "MBL", "EA"];
const FILTER_TABS = [
  ["", "All"],
  ["certificates", "Certificates"],
  ["test-reports", "Test reports"],
  ["ISSUED", "Issued"],
  ["SUPERSEDED", "Superseded"],
] as const;

function isLab(value: string | undefined): value is LabCode {
  return Boolean(value && LABS.includes(value as LabCode));
}

function isFilter(value: string | undefined): value is (typeof FILTER_TABS)[number][0] {
  return FILTER_TABS.some(([key]) => key && key === value);
}

export default async function IssuedDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; lab?: string }>;
}) {
  const staff = await requireStaff();
  if (!can(staff.role, "reports.read")) return <Empty>You do not have permission to view issued documents.</Empty>;
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const lab = isLab(query.lab) ? query.lab : undefined;
  const filter = isFilter(query.filter) ? query.filter : undefined;
  const scoped: Prisma.ReportWhereInput = lab ? { lab } : {};
  const searched: Prisma.ReportWhereInput = q
    ? {
        OR: [
          { certificateNo: { contains: q, mode: "insensitive" } },
          { job: { jobNo: { contains: q, mode: "insensitive" } } },
          { job: { sample: { description: { contains: q, mode: "insensitive" } } } },
          { job: { sample: { brandName: { contains: q, mode: "insensitive" } } } },
          { job: { sample: { request: { reference: { contains: q, mode: "insensitive" } } } } },
          { job: { sample: { request: { clientName: { contains: q, mode: "insensitive" } } } } },
        ],
      }
    : {};
  const filtered: Prisma.ReportWhereInput =
    filter === "certificates"
      ? { kind: "CERTIFICATE_OF_ANALYSIS" }
      : filter === "test-reports"
        ? { kind: "TEST_REPORT" }
        : filter === "ISSUED" || filter === "SUPERSEDED"
          ? { status: filter }
          : {};

  const [reports, kindCounts, statusCounts] = await Promise.all([
    prisma.report.findMany({
      where: { ...scoped, ...searched, ...filtered },
      include: reportListInclude,
      orderBy: { issuedAt: "desc" },
      take: 100,
    }),
    prisma.report.groupBy({ by: ["kind"], where: scoped, _count: { _all: true } }),
    prisma.report.groupBy({ by: ["status"], where: scoped, _count: { _all: true } }),
  ]);
  const kindCount = (kind: ReportKind) => kindCounts.find((row) => row.kind === kind)?._count._all ?? 0;
  const statusCount = (status: ReportStatus) => statusCounts.find((row) => row.status === status)?._count._all ?? 0;
  const total = statusCounts.reduce((sum, row) => sum + row._count._all, 0);
  const cards = [
    { label: "Certificates of analysis", value: kindCount("CERTIFICATE_OF_ANALYSIS"), filter: "certificates", tone: "teal" },
    { label: "Test reports", value: kindCount("TEST_REPORT"), filter: "test-reports", tone: "blue" },
    { label: "Current issued", value: statusCount("ISSUED"), filter: "ISSUED", tone: "green" },
    { label: "Superseded", value: statusCount("SUPERSEDED"), filter: "SUPERSEDED", tone: "amber" },
  ];
  const tabCount = (value: string) => {
    if (!value) return total;
    if (value === "certificates") return kindCount("CERTIFICATE_OF_ANALYSIS");
    if (value === "test-reports") return kindCount("TEST_REPORT");
    return statusCount(value as ReportStatus);
  };
  const issuerIds = [...new Set(reports.map((report) => report.issuedById))];
  const issuers = issuerIds.length
    ? Object.fromEntries(
        (await prisma.staffUser.findMany({ where: { id: { in: issuerIds } }, select: { id: true, fullName: true } })).map(
          (person) => [person.id, person.fullName],
        ),
      )
    : {};

  return (
    <>
      <PageHeading title="Issued documents" meta="Open a certificate or test report to download the official PDF or return to the work order." />

      <div className="stat-grid">
        {cards.map((card) => (
          <Link key={card.filter} href={reportsHref({ filter: card.filter, lab, q })} className={`stat-card stat-${card.tone}`}>
            <span className="stat-label">{card.label}</span>
            <strong className="stat-value">{card.value}</strong>
            <span className="stat-link">View →</span>
          </Link>
        ))}
      </div>

      <form className="search-row" method="get">
        {filter && <input type="hidden" name="filter" value={filter} />}
        <label className="search-grow">Search<input name="q" defaultValue={q} placeholder="Certificate number, sample, client, or work order" /></label>
        <label>Laboratory
          <select name="lab" defaultValue={lab ?? ""}>
            <option value="">All labs</option>
            {LABS.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Search</button>
      </form>

      <nav className="tabs tabs-pill" aria-label="Filter issued documents">
        {FILTER_TABS.map(([value, label]) => (
          <Link key={label} href={reportsHref({ filter: value, lab, q })} aria-current={(filter ?? "") === value ? "page" : undefined}>
            {label} ({tabCount(value)})
          </Link>
        ))}
      </nav>

      <IssuedDocumentsTable
        reports={reports}
        issuers={issuers}
        linkRequests={can(staff.role, "requests.read")}
        empty={q || filter || lab ? "No issued documents match these filters." : "No reports have been issued."}
      />
    </>
  );
}
