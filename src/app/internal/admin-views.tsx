import Link from "next/link";
import type { PaymentMethod } from "@prisma/client";
import { formatDate } from "@/lib/format";
import { Banner, Card, Empty, Facts, PageHeading, Status } from "@/components/shell";
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
        <div className="table-wrap">
          <table>
            <thead><tr><th>Request</th><th>Version</th><th>Lines</th><th>Created</th><th>Status</th></tr></thead>
            <tbody>
              {quotations.map((quotation) => (
                <tr key={quotation.id}>
                  <td><Link href={`/internal/quotations/${quotation.id}`}>{quotation.request.reference}</Link></td>
                  <td>{quotation.version}</td>
                  <td>{quotation.lines.length}</td>
                  <td>{formatDate(quotation.createdAt)}</td>
                  <td><Status value={quotation.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      <PageHeading
        title={`${quotation.request.reference}, version ${quotation.version}`}
        crumbs={[{ href: "/internal/quotations", label: "Quotations" }]}
        meta={<>Created {formatDate(quotation.createdAt)}{quotation.issuedAt && <> · Issued {formatDate(quotation.issuedAt)}</>}</>}
        action={<Status value={quotation.status} />}
      />
      <div className="detail-grid">
        <div className="detail-main">
          <Card title="Lines">
            {quotation.lines.length === 0 ? <p className="card-note">No lines yet.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Description</th><th>Qty</th><th className="num">Unit</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {quotation.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.description}</td>
                        <td>{line.quantity}</td>
                        <td className="num">{line.currency} {line.unitAmount.toString()}</td>
                        <td className="num">{line.currency} {line.amount.toString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {quotation.status === "DRAFT" && (
              fees.length === 0 ? <p className="help">No approved fee exists, so a priced line cannot be added.</p> : (
                <form action={quotationAction} className="stack subform">
                  <h3>Add a line</h3>
                  <input type="hidden" name="intent" value="line" />
                  <input type="hidden" name="quotationId" value={quotation.id} />
                  <input type="hidden" name="requestId" value={quotation.requestId} />
                  <div className="two">
                    <label>Approved fee<select name="feeScheduleId">{fees.map((fee) => <option key={fee.id} value={fee.id}>{fee.name} · {fee.currency} {fee.amount.toString()}</option>)}</select></label>
                    <label>Quantity<input name="quantity" type="number" min={1} defaultValue={1} /></label>
                  </div>
                  <button className="btn" type="submit">Add line</button>
                </form>
              )
            )}
          </Card>
        </div>
        <aside className="detail-side">
          <Card title="Summary">
            <Facts
              items={[
                ["Request", <Link key="r" href={`/internal/requests/${quotation.requestId}`}>{quotation.request.reference}</Link>],
                ["Client", quotation.request.clientName],
                ["Status", <Status key="s" value={quotation.status} />],
                ["Accepted", formatDate(quotation.acceptedAt)],
                ["Rejected", quotation.rejectedAt && `${formatDate(quotation.rejectedAt)}${quotation.rejectionReason ? `: ${quotation.rejectionReason}` : ""}`],
              ]}
            />
          </Card>
          {quotation.status === "DRAFT" && (
            <Card title="Issue to client" className="card-accent">
              <form action={quotationAction} className="stack">
                <p className="card-note">The client can accept or reject the quotation once it is issued.</p>
                <input type="hidden" name="intent" value="issue" />
                <input type="hidden" name="quotationId" value={quotation.id} />
                <input type="hidden" name="requestId" value={quotation.requestId} />
                <button className="btn btn-primary" type="submit">Issue quotation</button>
              </form>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

const PAYMENT_FILTERS = [
  ["", "All"],
  ["REFERENCE_SUBMITTED", "Reference submitted"],
  ["AWAITING", "Awaiting payment"],
  ["UNPRICED", "Unpriced"],
  ["CONFIRMED", "Confirmed"],
  ["WAIVED", "Waived"],
] as const;

const PAYMENT_METHODS: [PaymentMethod, string][] = [
  ["DIRECT_DEPOSIT", "Direct deposit"],
  ["WIRE_TRANSFER", "Wire transfer"],
  ["CHEQUE", "Cheque"],
  ["CASH", "Cash"],
  ["TO_BE_INVOICED", "To be invoiced"],
];

function money(amount: { toString(): string } | null, currency: string | null) {
  return amount == null ? null : `${currency ?? ""} ${Number(amount.toString()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

export async function PaymentsAdmin({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "payments.read")) return <Empty>You do not have permission to view payments.</Empty>;
  const query = await searchParams;
  const canConfirm = can(staff.role, "payments.confirm");
  const filter = PAYMENT_FILTERS.find(([value]) => value && value === query.status)?.[0];
  const [payments, counts, openable] = await Promise.all([
    prisma.payment.findMany({
      where: filter ? { status: filter } : {},
      include: { request: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
    canConfirm
      ? prisma.serviceRequest.findMany({
          where: { status: { in: ["ACKNOWLEDGED", "COMPLETED"] }, payments: { none: {} } },
          include: { quotations: { where: { status: "ACCEPTED" }, include: { lines: true }, orderBy: { version: "desc" }, take: 1 } },
          orderBy: { updatedAt: "desc" },
        })
      : [],
  ]);
  const count = (status: string) => counts.find((row) => row.status === status)?._count._all ?? 0;
  const total = counts.reduce((sum, row) => sum + row._count._all, 0);
  const cards = [
    { label: "Reference submitted", value: count("REFERENCE_SUBMITTED"), status: "REFERENCE_SUBMITTED", tone: "violet" },
    { label: "Awaiting payment", value: count("AWAITING"), status: "AWAITING", tone: "amber" },
    { label: "Unpriced", value: count("UNPRICED"), status: "UNPRICED", tone: "blue" },
    { label: "Confirmed", value: count("CONFIRMED"), status: "CONFIRMED", tone: "green" },
  ];

  return (
    <>
      <PageHeading title="Payments" meta="Confirming a payment is a staff decision. A client reference alone does not confirm it." />
      <Banner error={query.error} />

      <div className="stat-grid">
        {cards.map((card) => (
          <Link key={card.status} href={`/internal/payments?status=${card.status}`} className={`stat-card stat-${card.tone}`}>
            <span className="stat-label">{card.label}</span>
            <strong className="stat-value">{card.value}</strong>
            <span className="stat-link">View →</span>
          </Link>
        ))}
      </div>

      {canConfirm && openable.length > 0 && (
        <Card title="Open a payment record" className="card-accent">
          <form action={paymentStaffAction} className="open-payment">
            <input type="hidden" name="intent" value="open" />
            <label>Request
              <select name="requestId" required>
                {openable.map((request) => {
                  const quotation = request.quotations[0];
                  const amount = quotation ? quotation.lines.reduce((sum, line) => sum + Number(line.amount), 0) : null;
                  return (
                    <option key={request.id} value={request.id}>
                      {request.reference} · {request.clientName || "Client"} · {amount == null ? "no accepted quotation" : money(amount, quotation.currency)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>Method
              <select name="method" required defaultValue="DIRECT_DEPOSIT">
                {PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button className="btn btn-primary" type="submit">Open payment record</button>
          </form>
          <p className="help">The amount comes from the accepted quotation. Without one, the record opens as unpriced.</p>
        </Card>
      )}

      <nav className="tabs tabs-pill" aria-label="Filter payments">
        {PAYMENT_FILTERS.map(([value, label]) => (
          <Link key={label} href={value ? `/internal/payments?status=${value}` : "/internal/payments"} aria-current={(filter ?? "") === value ? "page" : undefined}>
            {label}{value ? ` (${count(value)})` : ` (${total})`}
          </Link>
        ))}
      </nav>

      {payments.length === 0 ? (
        <Empty>{filter ? "No payments with this status." : "No payment records yet. Open one from an acknowledged request."}</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Request</th><th>Client</th><th>Method</th><th className="num">Amount</th><th>Client reference</th><th>Status</th>{canConfirm && <th />}</tr></thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <Link href={`/internal/requests/${payment.requestId}`}>{payment.request.reference}</Link>
                    <small className="cell-sub">Opened {formatDate(payment.createdAt)}</small>
                  </td>
                  <td>{payment.request.clientName || "—"}</td>
                  <td>{PAYMENT_METHODS.find(([value]) => value === payment.method)?.[1] ?? "—"}</td>
                  <td className="num">{money(payment.amount, payment.currency) ?? <span className="facts-none">Unpriced</span>}</td>
                  <td>
                    {payment.clientReference ?? <span className="facts-none">None yet</span>}
                    {payment.referenceSubmittedAt && <small className="cell-sub">{formatDate(payment.referenceSubmittedAt)}</small>}
                  </td>
                  <td>
                    <Status value={payment.status} />
                    {payment.confirmedAt && <small className="cell-sub">{formatDate(payment.confirmedAt)}</small>}
                  </td>
                  {canConfirm && (
                    <td className="cell-action">
                      {(payment.status === "AWAITING" || payment.status === "REFERENCE_SUBMITTED") && (
                        <details className="inline-confirm">
                          <summary className="btn">Confirm</summary>
                          <form action={paymentStaffAction} className="stack">
                            <input type="hidden" name="intent" value="confirm" />
                            <input type="hidden" name="paymentId" value={payment.id} />
                            <label>Reconciliation note<input name="note" placeholder="Optional" /></label>
                            <button className="btn btn-primary" type="submit">Confirm payment</button>
                          </form>
                        </details>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
