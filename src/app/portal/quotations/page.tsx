import Link from "next/link";
import { Empty, PageHeading, Status } from "@/components/shell";
import { clientQuotationAction } from "@/server/actions";
import { prisma } from "@/server/prisma";
import { requireClient } from "@/server/session";

export default async function QuotationsPage() {
  const user = await requireClient();
  const quotations = await prisma.quotation.findMany({
    where: { request: { accountId: user.accountId } },
    include: { request: true, lines: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeading title="Invoices" meta="Accept or reject each invoice. You can pay before accepting." />
      {quotations.length === 0 ? <Empty>No invoices yet. One is issued when GDBS acknowledges a request.</Empty> : (
        <div className="stack">
          {quotations.map((quotation) => (
            <article key={quotation.id} className="panel">
              <h2>{quotation.request.reference} · version {quotation.version}</h2>
              <Status value={quotation.status} />
              <ul>{quotation.lines.map((line) => <li key={line.id}>{line.description} · {line.quantity} · {line.currency} {line.amount.toString()}</li>)}</ul>
              {quotation.status === "ISSUED" && (
                <form action={clientQuotationAction} className="stack">
                  <input type="hidden" name="quotationId" value={quotation.id} />
                  <p>{quotation.acceptanceTerms}</p>
                  <p className="help">You can accept this invoice now, or pay first and accept afterwards.</p>
                  <button className="btn btn-primary" name="decision" value="ACCEPTED">Accept invoice</button>
                  <Link className="btn" href={`/portal/requests/${quotation.requestId}?tab=payment`}>Pay before accepting</Link>
                  <label>Rejection reason<textarea name="reason" /></label>
                  <button className="btn" name="decision" value="REJECTED">Reject invoice</button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
