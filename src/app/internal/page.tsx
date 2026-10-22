import Link from "next/link";
import { Status } from "@/components/shell";
import { prisma } from "@/server/prisma";
import { can } from "@/server/permissions";
import { requireStaff } from "@/server/session";
import { OPEN_JOB_STATUSES } from "./jobs/work-orders-table";

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Grenada" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function InternalHome() {
  const staff = await requireStaff();
  const readRequests = can(staff.role, "requests.read");
  const readJobs = can(staff.role, "jobs.read");
  const readPayments = can(staff.role, "payments.read");
  const readReports = can(staff.role, "reports.read");
  const jobScope = { status: { in: [...OPEN_JOB_STATUSES] }, ...(staff.role === "ANALYST" ? { assigneeId: staff.id } : {}) };

  const [requests, jobs, awaiting, payments, reports, recentRequests, recentJobs] = await Promise.all([
    readRequests ? prisma.serviceRequest.count({ where: { status: "SUBMITTED" } }) : null,
    readJobs ? prisma.job.count({ where: jobScope }) : null,
    readJobs ? prisma.job.count({ where: { status: "AWAITING_VERIFICATION" } }) : null,
    readPayments ? prisma.payment.count({ where: { status: { in: ["AWAITING", "REFERENCE_SUBMITTED"] } } }) : null,
    readReports ? prisma.report.count({ where: { status: "ISSUED" } }) : null,
    readRequests
      ? prisma.serviceRequest.findMany({ where: { status: "SUBMITTED" }, orderBy: { submittedAt: "desc" }, take: 5 })
      : [],
    readJobs ? prisma.job.findMany({ where: jobScope, include: { sample: true }, orderBy: { updatedAt: "desc" }, take: 5 }) : [],
  ]);

  const cards = [
    requests != null && { label: "Requests to review", value: requests, href: "/internal/requests", tone: "blue" },
    jobs != null && { label: staff.role === "ANALYST" ? "My open work" : "Open work orders", value: jobs, href: staff.role === "ANALYST" ? "/internal/work" : "/internal/jobs?status=open", tone: "teal" },
    awaiting != null && { label: "Awaiting verification", value: awaiting, href: "/internal/jobs?status=AWAITING_VERIFICATION", tone: "amber" },
    payments != null && { label: "Payments to confirm", value: payments, href: "/internal/payments", tone: "violet" },
    reports != null && { label: "Issued documents", value: reports, href: "/internal/reports", tone: "green" },
  ].filter(Boolean) as { label: string; value: number; href: string; tone: string }[];

  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Grenada" }).format(new Date());

  return (
    <>
      <div className="dash-hero">
        <div>
          <p className="dash-date">{today}</p>
          <h1>{greeting()}, {staff.fullName.split(" ")[0]}</h1>
          <p className="dash-sub">Here is what needs attention across the laboratory today.</p>
        </div>
        {readRequests && <Link className="btn btn-primary" href="/internal/requests">Review requests</Link>}
      </div>

      <div className="stat-grid">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className={`stat-card stat-${card.tone}`}>
            <span className="stat-label">{card.label}</span>
            <strong className="stat-value">{card.value}</strong>
            <span className="stat-link">View →</span>
          </Link>
        ))}
      </div>

      <div className="dash-panels">
        {readRequests && (
          <section className="card">
            <header className="card-head">
              <h2>Requests waiting for review</h2>
              <Link href="/internal/requests">All requests</Link>
            </header>
            {recentRequests.length === 0 ? (
              <p className="card-empty">No submitted requests are waiting.</p>
            ) : (
              <ul className="list">
                {recentRequests.map((request) => (
                  <li key={request.id}>
                    <Link href={`/internal/requests/${request.id}`}>
                      <span>
                        <strong>{request.reference}</strong>
                        <small>{request.clientName || "Client"}{request.submittedAt ? ` · ${request.submittedAt.toLocaleDateString("en-GB", { timeZone: "America/Grenada" })}` : ""}</small>
                      </span>
                      <Status value={request.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {readJobs && (
          <section className="card">
            <header className="card-head">
              <h2>{staff.role === "ANALYST" ? "My work in progress" : "Work in progress"}</h2>
              <Link href="/internal/jobs">All work orders</Link>
            </header>
            {recentJobs.length === 0 ? (
              <p className="card-empty">No open work orders.</p>
            ) : (
              <ul className="list">
                {recentJobs.map((job) => (
                  <li key={job.id}>
                    <Link href={`/internal/jobs/${job.id}`}>
                      <span>
                        <strong>{job.jobNo}</strong>
                        <small>{job.sample.description}</small>
                      </span>
                      <Status value={job.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  );
}
