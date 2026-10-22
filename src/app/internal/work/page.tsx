import Link from "next/link";
import { Empty, PageHeading } from "@/components/shell";
import { can } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";
import { jobListInclude, WorkOrdersTable } from "../jobs/work-orders-table";

export default async function WorkPage() {
  const staff = await requireStaff();
  if (!can(staff.role, "jobs.read")) return <Empty>You do not have permission to view work orders.</Empty>;
  const mine = staff.role === "ANALYST" || staff.role === "TECHNICAL_OFFICER";
  const jobs = await prisma.job.findMany({
    where: mine ? { assigneeId: staff.id } : { status: { notIn: ["REPORT_ISSUED", "CANCELLED"] } },
    include: jobListInclude,
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const assigneeIds = [...new Set(jobs.map((job) => job.assigneeId).filter((id): id is string => Boolean(id)))];
  const assignees = assigneeIds.length
    ? Object.fromEntries(
        (await prisma.staffUser.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, fullName: true } })).map(
          (person) => [person.id, person.fullName],
        ),
      )
    : {};
  return (
    <>
      <PageHeading
        title="My work"
        meta={mine ? "Work orders assigned to you." : "Open work orders across the laboratory."}
        action={<Link className="btn" href="/internal/jobs">All work orders</Link>}
      />
      <WorkOrdersTable
        jobs={jobs}
        assignees={assignees}
        empty={mine ? "No work orders are assigned to you." : "No open work orders."}
      />
    </>
  );
}
