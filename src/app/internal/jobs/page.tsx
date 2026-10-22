import Link from "next/link";
import type { JobStatus, LabCode } from "@prisma/client";
import { Empty, PageHeading } from "@/components/shell";
import { can } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";
import { jobListInclude, jobsHref, OPEN_JOB_STATUSES, WorkOrdersTable } from "./work-orders-table";

const LABS: LabCode[] = ["AL", "MBL", "EA"];
const STATUS_TABS = [
  ["", "All"],
  ["open", "Open"],
  ["CREATED", "Created"],
  ["IN_ANALYSIS", "In analysis"],
  ["RESULTS_ENTERED", "Results entered"],
  ["AWAITING_VERIFICATION", "Awaiting verification"],
  ["VERIFIED", "Verified"],
  ["REPORT_ISSUED", "Issued"],
] as const;

function isLab(value: string | undefined): value is LabCode {
  return Boolean(value && LABS.includes(value as LabCode));
}

function isStatus(value: string | undefined): value is JobStatus {
  return STATUS_TABS.some(([key]) => key && key !== "open" && key === value);
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; lab?: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "jobs.read")) return <Empty>You do not have permission to view work orders.</Empty>;
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const lab = isLab(query.lab) ? query.lab : undefined;
  const status = query.status === "open" || isStatus(query.status) ? query.status : undefined;
  const scoped = lab ? { lab } : {};
  const searched = q
    ? {
        OR: [
          { jobNo: { contains: q, mode: "insensitive" as const } },
          { sample: { description: { contains: q, mode: "insensitive" as const } } },
          { sample: { brandName: { contains: q, mode: "insensitive" as const } } },
          { sample: { request: { reference: { contains: q, mode: "insensitive" as const } } } },
          { sample: { request: { clientName: { contains: q, mode: "insensitive" as const } } } },
        ],
      }
    : {};
  const statusWhere =
    status === "open" ? { status: { in: [...OPEN_JOB_STATUSES] } } : status ? { status: status as JobStatus } : {};

  const [jobs, counts] = await Promise.all([
    prisma.job.findMany({
      where: { ...scoped, ...searched, ...statusWhere },
      include: jobListInclude,
      orderBy: [{ jobDate: "desc" }, { jobNo: "desc" }],
      take: 100,
    }),
    prisma.job.groupBy({ by: ["status"], where: scoped, _count: { _all: true } }),
  ]);
  const count = (value: string) => counts.find((row) => row.status === value)?._count._all ?? 0;
  const total = counts.reduce((sum, row) => sum + row._count._all, 0);
  const open = OPEN_JOB_STATUSES.reduce((sum, value) => sum + count(value), 0);
  const cards = [
    { label: "Open", value: open, status: "open", tone: "teal" },
    { label: "In analysis", value: count("IN_ANALYSIS"), status: "IN_ANALYSIS", tone: "blue" },
    { label: "Awaiting verification", value: count("AWAITING_VERIFICATION"), status: "AWAITING_VERIFICATION", tone: "amber" },
    { label: "Reports issued", value: count("REPORT_ISSUED"), status: "REPORT_ISSUED", tone: "green" },
  ];
  const assigneeIds = [...new Set(jobs.map((job) => job.assigneeId).filter((id): id is string => Boolean(id)))];
  const assignees = assigneeIds.length
    ? Object.fromEntries(
        (await prisma.staffUser.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, fullName: true } })).map(
          (person) => [person.id, person.fullName],
        ),
      )
    : {};
  const tabCount = (value: string) => {
    if (!value) return total;
    if (value === "open") return open;
    return count(value);
  };

  return (
    <>
      <PageHeading title="Work orders" meta="Open a work order to record results, verify, or issue the report." />

      <div className="stat-grid">
        {cards.map((card) => (
          <Link key={card.status} href={jobsHref({ status: card.status, lab, q })} className={`stat-card stat-${card.tone}`}>
            <span className="stat-label">{card.label}</span>
            <strong className="stat-value">{card.value}</strong>
            <span className="stat-link">View →</span>
          </Link>
        ))}
      </div>

      <form className="search-row" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <label className="search-grow">Search<input name="q" defaultValue={q} placeholder="Job number, sample, client, or request" /></label>
        <label>Laboratory
          <select name="lab" defaultValue={lab ?? ""}>
            <option value="">All labs</option>
            {LABS.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Search</button>
      </form>

      <nav className="tabs tabs-pill" aria-label="Filter work orders">
        {STATUS_TABS.map(([value, label]) => (
          <Link key={label} href={jobsHref({ status: value, lab, q })} aria-current={(status ?? "") === value ? "page" : undefined}>
            {label} ({tabCount(value)})
          </Link>
        ))}
      </nav>

      <WorkOrdersTable
        jobs={jobs}
        assignees={assignees}
        empty={q || status || lab ? "No work orders match these filters." : "No work orders yet."}
      />
    </>
  );
}
