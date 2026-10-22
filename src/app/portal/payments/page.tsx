import Link from "next/link";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { Banner, Card, Empty, Facts, PageHeading, Status } from "@/components/shell";
import { paymentReferenceAction } from "@/server/actions";
import { prisma } from "@/server/prisma";
import { requireClient } from "@/server/session";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireClient();
  const query = await searchParams;
  const payments = await prisma.payment.findMany({
    where: { request: { accountId: user.accountId } },
    include: { request: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeading
        title="Payments"
        meta="You can pay before accepting the invoice. Accounts confirms and signs off the payment."
      />
      <Banner error={query.error} />
      {payments.length === 0 ? (
        <Empty>No payment records yet. One opens when GDBS issues the invoice.</Empty>
      ) : (
        <div className="detail-main">
          {payments.map((payment) => {
            const open = payment.status !== "CONFIRMED" && payment.status !== "WAIVED";
            return (
              <Card
                key={payment.id}
                title={<Link href={`/portal/requests/${payment.requestId}?tab=payment`}>{payment.request.reference}</Link>}
                action={<Status value={payment.status} />}
              >
                <Facts
                  items={[
                    ["Amount", payment.amount ? `${payment.currency ?? ""} ${payment.amount.toString()}`.trim() : "Not priced yet"],
                    ["Method", humanize(payment.method)],
                    ["Opened", formatDate(payment.createdAt)],
                    ["Your reference", payment.clientReference],
                    ["Reference submitted", formatDateTime(payment.referenceSubmittedAt)],
                    ["Confirmed", formatDateTime(payment.confirmedAt) ?? "Not yet"],
                  ]}
                />
                {open && (
                  <form action={paymentReferenceAction} className="upload-row subform">
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <label>Payment reference<input name="reference" required defaultValue={payment.clientReference ?? ""} /></label>
                    <button className="btn btn-primary" type="submit">{payment.clientReference ? "Update reference" : "Submit reference"}</button>
                  </form>
                )}
              </Card>
            );
          })}
          <p className="help">No bank account number is shown because GDBS has not supplied one.</p>
        </div>
      )}
    </>
  );
}
