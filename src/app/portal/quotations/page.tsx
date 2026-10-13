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
      <PageHeading title="Quotations" />
      {quotations.length === 0 ? <Empty>No quotations have been issued. Rates are not loaded until GDBS approves them.</Empty> : (
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
                  <button className="btn btn-primary" name="decision" value="ACCEPTED">Accept</button>
                  <label>Rejection reason<textarea name="reason" /></label>
                  <button className="btn" name="decision" value="REJECTED">Reject</button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
