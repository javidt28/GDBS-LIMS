import { PageHeading } from "@/components/shell";
import { prisma } from "@/server/prisma";
import { can } from "@/server/permissions";
import { requireStaff } from "@/server/session";

export default async function InternalHome() {
  const staff = await requireStaff();
  const [requests, jobs, payments, reports] = await Promise.all([
    can(staff.role, "requests.read") ? prisma.serviceRequest.count({ where: { status: "SUBMITTED" } }) : Promise.resolve(null),
    can(staff.role, "jobs.read") ? prisma.job.count({ where: { status: { in: ["CREATED", "IN_ANALYSIS", "RESULTS_ENTERED", "AWAITING_VERIFICATION"] }, ...(staff.role === "ANALYST" ? { assigneeId: staff.id } : {}) } }) : Promise.resolve(null),
    can(staff.role, "payments.read") ? prisma.payment.count({ where: { status: { in: ["AWAITING", "REFERENCE_SUBMITTED"] } } }) : Promise.resolve(null),
    can(staff.role, "reports.read") ? prisma.report.count({ where: { status: "ISSUED" } }) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeading title="Dashboard" />
      <div className="metrics">
        {requests != null && <div className="metric"><span>Requests to review</span><strong>{requests}</strong></div>}
        {jobs != null && <div className="metric"><span>{staff.role === "ANALYST" ? "My open work" : "Open work orders"}</span><strong>{jobs}</strong></div>}
        {payments != null && <div className="metric"><span>Payments to confirm</span><strong>{payments}</strong></div>}
        {reports != null && <div className="metric"><span>Issued documents</span><strong>{reports}</strong></div>}
      </div>
      <p className="help">Counts come from records in this database. An empty system shows zero.</p>
    </>
  );
}
