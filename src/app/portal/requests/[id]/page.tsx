import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { Banner, Card, Facts, PageHeading, Status } from "@/components/shell";
import { clientQuotationAction, paymentReferenceAction, uploadAction } from "@/server/actions";
import { DomainError } from "@/server/errors";
import { prisma } from "@/server/prisma";
import { clientProgress, getRequestForAccount } from "@/server/requests";
import { requireClient } from "@/server/session";

const ACTIVITY_LABELS: Record<string, string> = {
  "request.submit": "Request submitted",
  "request.acknowledged": "Request acknowledged by GDBS",
  "request.returned": "Request returned for changes",
  "request.rejected": "Request rejected",
};

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
    ...(request.quotations.length ? [["invoice", "Invoice"]] : []),
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
  const payment = request.payments[0];
  const editable = request.status === "DRAFT" || request.status === "RETURNED";
  const service = [humanize(request.serviceType), request.serviceTypeOther].filter(Boolean).join(" · ");

  const progress = (
    <ol className="steps-track">
      {steps.map((step) => (
        <li key={step.label} className={step.done ? "done" : undefined}>
          <span className="steps-dot" aria-hidden="true" />
          <span>{step.label}</span>
          {step.done && <span className="sr-only"> (done)</span>}
        </li>
      ))}
    </ol>
  );

  const uploadForm = (
    <form action={uploadAction} className="upload-row">
      <input type="hidden" name="requestId" value={request.id} />
      <label>Supporting document<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required /></label>
      <button className="btn" type="submit">Upload</button>
    </form>
  );

  return (
    <>
      <PageHeading
        title={request.reference}
        crumbs={[{ href: "/portal/requests", label: "My requests" }]}
        meta={<>{service || "Service not selected"}{request.submittedAt && <> · Submitted {formatDate(request.submittedAt)}</>}</>}
        action={<Status value={request.status} />}
      />
      <Banner error={query.error} ok={query.submitted ? "Request submitted." : query.draft ? "Draft saved." : undefined} />
      {request.status === "RETURNED" && <p className="banner-error">Returned: {request.returnReason}</p>}
      {request.status === "REJECTED" && <p className="banner-error">Rejected: {request.rejectionReason}</p>}

      <nav className="tabs tabs-pill" aria-label="Request sections">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/portal/requests/${request.id}?tab=${key}`} aria-current={tab === key ? "page" : undefined}>{label}</Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="detail-grid">
          <div className="detail-main">
            <Card
              title="Summary"
              action={editable && <Link className="btn btn-primary" href={`/portal/requests/${request.id}/edit`}>Continue request</Link>}
            >
              <Facts
                items={[
                  ["Client", request.clientName],
                  ["Service", service],
                  ["Samples", String(request.samples.length)],
                  ["Documents", String(request.documents.length)],
                  ["Last updated", formatDateTime(request.updatedAt)],
                  ["Submitted", formatDateTime(request.submittedAt)],
                ]}
              />
            </Card>
            <Card title="Add a supporting document">{uploadForm}</Card>
          </div>
          <aside className="detail-side">
            <Card title="Progress">{progress}</Card>
          </aside>
        </div>
      )}

      {tab === "details" && (
        <Card title="Request details">
          <Facts
            items={[
              ["Contact person", request.contactPerson],
              ["Phone", request.contactNo],
              ["Email", request.contactEmail],
              ["Decision rule acknowledged", request.decisionRuleAck ? `Yes, ${request.signatureName}` : "No"],
              ["Address", request.clientAddress, true],
              ["Description", request.description, true],
            ]}
          />
        </Card>
      )}

      {tab === "invoice" && quotation && (
        <Card title={`Invoice, version ${quotation.version}`} action={<Status value={quotation.status} />}>
          {quotation.lines.length === 0 ? <p className="card-note">GDBS has not priced this invoice yet.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Description</th><th>Qty</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {quotation.lines.map((line) => (
                    <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td className="num">{line.currency} {line.amount.toString()}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {quotation.status === "ISSUED" && (
            <div className="stack subform">
              {quotation.acceptanceTerms && <p className="card-note">{quotation.acceptanceTerms}</p>}
              <p className="help">You can accept this invoice now, or pay first and accept afterwards.</p>
              <form action={clientQuotationAction} className="row-actions">
                <input type="hidden" name="quotationId" value={quotation.id} />
                <button className="btn btn-primary" name="decision" value="ACCEPTED">Accept invoice</button>
                <Link className="btn" href={`/portal/requests/${request.id}?tab=payment`}>Pay before accepting</Link>
              </form>
              <form action={clientQuotationAction} className="stack">
                <input type="hidden" name="quotationId" value={quotation.id} />
                <label>Reason for rejection<textarea name="reason" required /></label>
                <button className="btn" name="decision" value="REJECTED">Reject invoice</button>
              </form>
            </div>
          )}
          {quotation.status === "ACCEPTED" && <p className="card-note">Accepted. Submit a payment reference if you have not already paid.</p>}
          {quotation.status === "REJECTED" && <p className="card-note">Rejection: {quotation.rejectionReason}</p>}
        </Card>
      )}

      {tab === "payment" && payment && (
        <Card title="Payment" action={<Status value={payment.status} />}>
          <Facts
            items={[
              ["Amount", payment.amount ? `${payment.currency} ${payment.amount.toString()}` : "Amount not set"],
              ["Your reference", payment.clientReference],
              ["Reference submitted", formatDateTime(payment.referenceSubmittedAt)],
              ["Confirmed", formatDateTime(payment.confirmedAt)],
            ]}
          />
          <p className="help">You may pay before accepting the invoice. A reference you submit is not confirmed until the accounts department signs it off.</p>
          {payment.status !== "CONFIRMED" && payment.status !== "WAIVED" && (
            <form action={paymentReferenceAction} className="upload-row">
              <input type="hidden" name="paymentId" value={payment.id} />
              <input type="hidden" name="requestId" value={request.id} />
              <label>Payment reference<input name="reference" required defaultValue={payment.clientReference ?? ""} /></label>
              <button className="btn" type="submit">Submit reference</button>
            </form>
          )}
        </Card>
      )}

      {tab === "samples" && (
        <Card title="Samples">
          <ul className="list list-flush">
            {request.samples.map((sample) => (
              <li key={sample.id}>
                <div className="list-row">
                  <span>
                    <strong>{sample.description}</strong>
                    <small>{sample.receivedAt ? `Received ${formatDateTime(sample.receivedAt)}` : "Not yet received"}</small>
                  </span>
                  <span className={sample.receivedAt ? "chip chip-good" : "chip"}>{sample.receivedAt ? "Received" : "Pending"}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "progress" && <Card title="Progress">{progress}</Card>}

      {tab === "documents" && (
        <Card title="Documents">
          <ul className="file-list">
            {request.documents.map((document) => (
              <li key={document.id}><a href={`/files/documents/${document.id}`}>{document.filename}</a></li>
            ))}
          </ul>
          <div className="subform">{uploadForm}</div>
        </Card>
      )}

      {tab === "activity" && (
        <Card title="Activity">
          {activity.length === 0 ? <p className="card-note">No activity yet.</p> : (
            <ol className="activity">
              {activity.map((event) => (
                <li key={event.id}>
                  <strong>{ACTIVITY_LABELS[event.action] ?? humanize(event.action)}</strong>
                  <small>{formatDateTime(event.createdAt)}</small>
                  {event.reason && <p>{event.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </>
  );
}
