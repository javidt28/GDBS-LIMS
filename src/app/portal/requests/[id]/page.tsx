import Link from "next/link";
import { notFound } from "next/navigation";
import { Banner, PageHeading, Status } from "@/components/shell";
import { clientQuotationAction, paymentReferenceAction, uploadAction } from "@/server/actions";
import { DomainError } from "@/server/errors";
import { prisma } from "@/server/prisma";
import { clientProgress, getRequestForAccount } from "@/server/requests";
import { requireClient } from "@/server/session";

export default async function RequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string; submitted?: string; draft?: string }>;
}) {
  const user = await requireClient();
  const { id } = await params;
  const query = await searchParams;
  let request;
  try {
    request = await getRequestForAccount(user.accountId, id);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
  const steps = await clientProgress(id, user.accountId);
  const tabs = [
    ["overview", "Overview"],
    ["details", "Request details"],
    ...(request.quotations.length ? [["quotation", "Quotation"]] : []),
    ...(request.payments.length ? [["payment", "Payment"]] : []),
    ...(request.samples.length ? [["samples", "Samples"]] : []),
    ["progress", "Progress"],
    ...(request.documents.length ? [["documents", "Documents"]] : []),
    ["activity", "Activity"],
  ];
  const tab = tabs.some((item) => item[0] === query.tab) ? query.tab : "overview";
  const activity = await prisma.auditLog.findMany({
    where: {
      entity: "ServiceRequest",
      entityId: request.id,
      action: { in: ["request.submit", "request.acknowledged", "request.returned", "request.rejected"] },
    },
    orderBy: { createdAt: "desc" },
  });
  const quotation = request.quotations[0];
  return (
    <>
      <PageHeading title={request.reference} crumbs={[{ href: "/portal/requests", label: "My requests" }]} action={<Status value={request.status} />} />
      <Banner error={query.error} ok={query.submitted ? "Request submitted." : query.draft ? "Draft saved." : undefined} />
      {request.status === "RETURNED" && <p className="banner-error">Returned: {request.returnReason}</p>}
      {request.status === "REJECTED" && <p className="banner-error">Rejected: {request.rejectionReason}</p>}
      <div className="tabs">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/portal/requests/${request.id}?tab=${key}`} aria-current={tab === key ? "page" : undefined}>{label}</Link>
        ))}
      </div>
      {tab === "overview" && (
        <div className="stack">
          <p>{request.clientName} · {request.serviceType ?? "Service not selected"}</p>
          {(request.status === "DRAFT" || request.status === "RETURNED") && <Link className="btn" href={`/portal/requests/${request.id}/edit`}>Continue request</Link>}
        </div>
      )}
      {tab === "details" && (
        <dl className="stack">
          <div><dt>Address</dt><dd>{request.clientAddress || "—"}</dd></div>
          <div><dt>Contact</dt><dd>{request.contactPerson || "—"} · {request.contactNo || "—"} · {request.contactEmail || "—"}</dd></div>
          <div><dt>Description</dt><dd>{request.description || "—"}</dd></div>
          <div><dt>Decision rule acknowledged</dt><dd>{request.decisionRuleAck ? `Yes, ${request.signatureName}` : "No"}</dd></div>
          {request.samples.map((sample) => (
            <div key={sample.id}><dt>Sample</dt><dd>{sample.description}{sample.brandName ? ` · ${sample.brandName}` : ""}</dd></div>
          ))}
        </dl>
      )}
      {tab === "quotation" && quotation && (
        <div className="stack">
          <p>Version {quotation.version} <Status value={quotation.status} /></p>
          {quotation.lines.length === 0 ? <p>No lines.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead>
                <tbody>
                  {quotation.lines.map((line) => (
                    <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.currency} {line.amount.toString()}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {quotation.status === "ISSUED" && (
            <>
              <p>{quotation.acceptanceTerms}</p>
              <form action={clientQuotationAction} className="row-actions">
                <input type="hidden" name="quotationId" value={quotation.id} />
                <button className="btn btn-primary" name="decision" value="ACCEPTED">Accept</button>
              </form>
              <form action={clientQuotationAction} className="stack">
                <input type="hidden" name="quotationId" value={quotation.id} />
                <label>Reason for rejection<textarea name="reason" required /></label>
                <button className="btn" name="decision" value="REJECTED">Reject quotation</button>
              </form>
            </>
          )}
          {quotation.status === "REJECTED" && <p>Rejection: {quotation.rejectionReason}</p>}
        </div>
      )}
      {tab === "payment" && request.payments[0] && (
        <div className="stack">
          <p><Status value={request.payments[0].status} /> {request.payments[0].amount ? `${request.payments[0].currency} ${request.payments[0].amount.toString()}` : "Amount not set"}</p>
          <p className="help">A reference you submit is not a confirmed payment. GDBS confirms it after reconciliation. Banking instructions have not been loaded.</p>
          {request.payments[0].status !== "CONFIRMED" && (
            <form action={paymentReferenceAction} className="stack">
              <input type="hidden" name="paymentId" value={request.payments[0].id} />
              <label>Payment reference<input name="reference" required /></label>
              <button className="btn" type="submit">Submit reference</button>
            </form>
          )}
        </div>
      )}
      {tab === "samples" && (
        <ul>
          {request.samples.map((sample) => (
            <li key={sample.id}>{sample.description} — {sample.receivedAt ? `Received ${sample.receivedAt.toISOString().slice(0, 16)}` : "Not yet received"}</li>
          ))}
        </ul>
      )}
      {tab === "progress" && (
        <ol className="timeline">
          {steps.map((step) => (
            <li key={step.label}><span className={step.done ? "dot on" : "dot"} /><span>{step.label}</span></li>
          ))}
        </ol>
      )}
      {tab === "documents" && (
        <div className="stack">
          <ul>{request.documents.map((document) => <li key={document.id}><a href={`/files/documents/${document.id}`}>{document.filename}</a></li>)}</ul>
          <form action={uploadAction} className="stack">
            <input type="hidden" name="requestId" value={request.id} />
            <label>Supporting document<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required /></label>
            <button className="btn" type="submit">Upload</button>
          </form>
        </div>
      )}
      {tab === "activity" && (
        activity.length === 0 ? <p>No activity yet.</p> : (
          <ul>{activity.map((event) => <li key={event.id}>{event.createdAt.toISOString().slice(0, 16)} — {event.action}{event.reason ? `: ${event.reason}` : ""}</li>)}</ul>
        )
      )}
      {tab === "overview" && (
        <form action={uploadAction} className="stack" style={{ marginTop: "1rem" }}>
          <input type="hidden" name="requestId" value={request.id} />
          <label>Supporting document<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" /></label>
          <button className="btn" type="submit">Upload</button>
        </form>
      )}
    </>
  );
}
