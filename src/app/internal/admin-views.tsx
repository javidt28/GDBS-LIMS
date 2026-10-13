import { Banner, Empty, PageHeading } from "@/components/shell";
import { feeAction, paymentStaffAction, quotationAction, termsAction, createStaffAction, numberingAction } from "@/server/actions";
import { can } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";

export async function QuotationsAdmin() {
  const staff = await requireStaff();
  if (!can(staff.role, "quotations.read")) return <Empty>You do not have permission to view quotations.</Empty>;
  const quotations = await prisma.quotation.findMany({ include: { request: true, lines: true }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeading title="Quotations" />
      {quotations.length === 0 ? <Empty>No quotations. A line can be added only from an approved fee, and none are loaded.</Empty> : (
        <ul>{quotations.map((quotation) => <li key={quotation.id}>{quotation.request.reference} v{quotation.version} {quotation.status}</li>)}</ul>
      )}
    </>
  );
}

export async function QuotationDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "quotations.read")) return <Empty>You do not have permission to view quotations.</Empty>;
  const { id } = await params;
  const quotation = await prisma.quotation.findUnique({ where: { id }, include: { lines: true, request: true } });
  const fees = await prisma.feeSchedule.findMany({ orderBy: { name: "asc" } });
  if (!quotation) return <Empty>Quotation not found.</Empty>;
  return (
    <>
      <PageHeading title={`${quotation.request.reference} version ${quotation.version}`} />
      <p>{quotation.status}</p>
      <ul>{quotation.lines.map((line) => <li key={line.id}>{line.description} · {line.currency} {line.amount.toString()}</li>)}</ul>
      {quotation.status === "DRAFT" && (
        <>
          {fees.length === 0 ? <p>No approved fee exists, so a priced line cannot be added.</p> : (
            <form action={quotationAction} className="stack">
              <input type="hidden" name="intent" value="line" />
              <input type="hidden" name="quotationId" value={quotation.id} />
              <input type="hidden" name="requestId" value={quotation.requestId} />
              <label>Approved fee<select name="feeScheduleId">{fees.map((fee) => <option key={fee.id} value={fee.id}>{fee.name} · {fee.currency} {fee.amount.toString()}</option>)}</select></label>
              <label>Quantity<input name="quantity" type="number" min={1} defaultValue={1} /></label>
              <button className="btn" type="submit">Add line</button>
            </form>
          )}
          <form action={quotationAction}>
            <input type="hidden" name="intent" value="issue" />
            <input type="hidden" name="quotationId" value={quotation.id} />
            <input type="hidden" name="requestId" value={quotation.requestId} />
            <button className="btn btn-primary" type="submit">Issue quotation</button>
          </form>
        </>
      )}
    </>
  );
}

export async function PaymentsAdmin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "payments.read")) return <Empty>You do not have permission to view payments.</Empty>;
  const query = await searchParams;
  const payments = await prisma.payment.findMany({ include: { request: true }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeading title="Payments" />
      <Banner error={query.error} />
      <p className="help">Confirming a payment is a staff decision. A client reference alone does not confirm it.</p>
      {payments.length === 0 ? <Empty>No payments.</Empty> : payments.map((payment) => (
        <article key={payment.id} className="panel">
          <h2>{payment.request.reference}</h2>
          <p>{payment.status} · {payment.clientReference || "No reference"}</p>
          {payment.status !== "CONFIRMED" && (
            <form action={paymentStaffAction}>
              <input type="hidden" name="paymentId" value={payment.id} />
              <button className="btn" type="submit">Confirm payment</button>
            </form>
          )}
        </article>
      ))}
    </>
  );
}

export async function FeesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "fees.read")) return <Empty>You do not have permission to view the fee schedule.</Empty>;
  const query = await searchParams;
  const fees = await prisma.feeSchedule.findMany({ orderBy: { effectiveFrom: "desc" } });
  return (
    <>
      <PageHeading title="Fee schedule" />
      <Banner error={query.error} />
      {fees.length === 0 && <Empty>No fees have been approved. Nothing is preloaded, including the published label fee, because that service is outside this release.</Empty>}
      <ul>{fees.map((fee) => <li key={fee.id}>{fee.code} · {fee.name} · {fee.currency} {fee.amount.toString()} per {fee.unit}</li>)}</ul>
      {staff.role === "ADMINISTRATOR" && (
        <form action={feeAction} className="stack form-section">
          <h2>Approve a fee</h2>
          <label>Code<input name="code" required /></label>
          <label>Name<input name="name" required /></label>
          <label>Unit<input name="unit" required placeholder="per sample" /></label>
          <label>Amount<input name="amount" required /></label>
          <label>Currency code<input name="currency" required placeholder="As supplied by GDBS" /></label>
          <label>Effective from<input type="date" name="effectiveFrom" required /></label>
          <label>Notes<textarea name="notes" /></label>
          <button className="btn btn-primary" type="submit">Save fee</button>
        </form>
      )}
    </>
  );
}

export async function IssuedPage() {
  const staff = await requireStaff();
  if (!can(staff.role, "reports.read")) return <Empty>You do not have permission to view issued documents.</Empty>;
  const reports = await prisma.report.findMany({ orderBy: { issuedAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeading title="Issued documents" />
      {reports.length === 0 ? <Empty>No reports have been issued.</Empty> : (
        <ul>{reports.map((report) => <li key={report.id}><a href={`/files/reports/${report.id}`}>{report.certificateNo}/{String(report.sampleIndex).padStart(3, "0")}</a> {report.status} revision {report.revision}</li>)}</ul>
      )}
    </>
  );
}

export async function StaffNotes() {
  const staff = await requireStaff();
  const notes = await prisma.notification.findMany({ where: { staffUserId: staff.id }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeading title="Notifications" />
      {notes.length === 0 ? <Empty>No notifications.</Empty> : <ul>{notes.map((note) => <li key={note.id}><strong>{note.title}</strong> {note.body}</li>)}</ul>}
    </>
  );
}

export async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const staff = await requireStaff();
  if (staff.role !== "ADMINISTRATOR") return <Empty>Only an administrator can manage users.</Empty>;
  const query = await searchParams;
  const users = await prisma.staffUser.findMany({ orderBy: { fullName: "asc" } });
  return (
    <>
      <PageHeading title="Users" />
      <Banner error={query.error} ok={query.saved ? "Staff account created." : undefined} />
      <ul>{users.map((user) => <li key={user.id}>{user.fullName} · {user.email} · {user.role}</li>)}</ul>
      <form action={createStaffAction} className="stack form-section">
        <h2>Create staff account</h2>
        <label>Name<input name="fullName" required /></label>
        <label>Email<input name="email" type="email" required /></label>
        <label>Temporary password<input name="password" type="password" minLength={12} required /></label>
        <label>Role
          <select name="role">
            {["RECEPTION", "ANALYST", "TECHNICAL_OFFICER", "QUALITY_MANAGER", "APPROVER", "FINANCE", "ADMINISTRATOR"].map((role) => <option key={role}>{role}</option>)}
          </select>
        </label>
        <label>Lab
          <select name="lab"><option value="">None</option><option>AL</option><option>MBL</option><option>EA</option></select>
        </label>
        <button className="btn btn-primary" type="submit">Create</button>
      </form>
    </>
  );
}

export async function NumberingPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const staff = await requireStaff();
  if (staff.role !== "ADMINISTRATOR") return <Empty>Only an administrator can set numbering.</Empty>;
  const query = await searchParams;
  const sequences = await prisma.numberSequence.findMany({ orderBy: { key: "asc" } });
  return (
    <>
      <PageHeading title="Numbering" />
      <Banner error={query.error} ok={query.saved ? "Sequence updated." : undefined} />
      <p className="help">Job numbers follow YYYYMMDD plus AL, MBL, or EA plus a daily sequence, as in the 2026 work-order log. Certificate numbers are the year, the lab code, and a running number. Set the current value before production so new numbers do not collide with the paper log. Historical rows are not imported.</p>
      <ul>{sequences.map((sequence) => <li key={sequence.key}>{sequence.key}: {sequence.value}</li>)}</ul>
      <form action={numberingAction} className="stack">
        <label>Sequence key<input name="key" placeholder="cert:2026:AL" required /></label>
        <label>Current value<input name="value" type="number" min={0} required /></label>
        <label>Reason<textarea name="reason" required /></label>
        <button className="btn" type="submit">Set current value</button>
      </form>
    </>
  );
}

export async function AuditPage() {
  const staff = await requireStaff();
  if (staff.role !== "ADMINISTRATOR") return <Empty>Only an administrator can read the audit trail.</Empty>;
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeading title="Audit trail" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td>{row.createdAt.toISOString().slice(0, 16)}</td><td>{row.action}</td><td>{row.entity}</td><td>{row.actorType}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

export async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const staff = await requireStaff();
  if (staff.role !== "ADMINISTRATOR") return <Empty>Only an administrator can change settings.</Empty>;
  const query = await searchParams;
  const terms = await prisma.systemSetting.findUnique({ where: { key: "quotation.acceptanceTerms" } });
  return (
    <>
      <PageHeading title="Settings" />
      <Banner error={query.error} ok={query.saved ? "Saved." : undefined} />
      <p>Quotation acceptance terms are empty until GDBS supplies the wording. A quotation cannot be issued without them.</p>
      <p>Current terms: {typeof terms?.value === "string" && terms.value ? terms.value : "Not set."}</p>
      {staff.role === "ADMINISTRATOR" && (
        <form action={termsAction} className="stack">
          <label>Approved acceptance terms<textarea name="terms" required /></label>
          <button className="btn btn-primary" type="submit">Save terms</button>
        </form>
      )}
    </>
  );
}
