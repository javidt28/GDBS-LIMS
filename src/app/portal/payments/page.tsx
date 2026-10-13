import { Empty, PageHeading, Status } from "@/components/shell";
import { paymentReferenceAction } from "@/server/actions";
import { prisma } from "@/server/prisma";
import { requireClient } from "@/server/session";

export default async function PaymentsPage() {
  const user = await requireClient();
  const payments = await prisma.payment.findMany({
    where: { request: { accountId: user.accountId } },
    include: { request: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeading title="Payments" />
      <p className="help">Card payment is not available. A submitted bank reference stays unconfirmed until GDBS records it. No bank account number is shown because GDBS has not supplied one.</p>
      {payments.length === 0 ? <Empty>No payment records.</Empty> : (
        <div className="stack">
          {payments.map((payment) => (
            <article key={payment.id} className="panel">
              <h2>{payment.request.reference}</h2>
              <Status value={payment.status} />
              <p>{payment.method ?? "Method not set"} · {payment.amount ? `${payment.currency} ${payment.amount.toString()}` : "Unpriced"}</p>
              {payment.status !== "CONFIRMED" && payment.status !== "WAIVED" && (
                <form action={paymentReferenceAction} className="stack">
                  <input type="hidden" name="paymentId" value={payment.id} />
                  <label>Payment reference<input name="reference" required defaultValue={payment.clientReference ?? ""} /></label>
                  <button className="btn" type="submit">Submit reference</button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
