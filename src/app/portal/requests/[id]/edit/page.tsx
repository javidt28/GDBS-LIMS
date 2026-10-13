import { notFound } from "next/navigation";
import { Banner, PageHeading } from "@/components/shell";
import { RequestForm } from "@/components/request-form";
import { DomainError } from "@/server/errors";
import { getRequestForAccount } from "@/server/requests";
import { requireClient } from "@/server/session";

export default async function EditRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireClient();
  const { id } = await params;
  const query = await searchParams;
  try {
    const request = await getRequestForAccount(user.accountId, id);
    if (request.status !== "DRAFT" && request.status !== "RETURNED") notFound();
    return (
      <>
        <PageHeading title={`Edit ${request.reference}`} crumbs={[{ href: `/portal/requests/${request.id}`, label: request.reference }]} />
        <Banner error={query.error} />
        <RequestForm
          requestId={request.id}
          initial={{
            clientName: request.clientName,
            clientAddress: request.clientAddress ?? "",
            contactPerson: request.contactPerson ?? "",
            contactNo: request.contactNo ?? "",
            contactEmail: request.contactEmail ?? "",
            serviceType: request.serviceType ?? "",
            serviceTypeOther: request.serviceTypeOther ?? "",
            description: request.description ?? "",
            decisionRuleAck: request.decisionRuleAck,
            signatureName: request.signatureName ?? "",
            samples: request.samples.map((sample) => ({
              description: sample.description,
              brandName: sample.brandName ?? "",
              sizeQuantity: sample.sizeQuantity ?? "",
              manufacturer: sample.manufacturer ?? "",
              lotNo: sample.lotNo ?? "",
              bestBefore: sample.bestBefore ? sample.bestBefore.toISOString().slice(0, 10) : "",
              collectionPoint: sample.collectionPoint ?? "",
              receiptNo: sample.receiptNo ?? "",
              comments: sample.comments ?? "",
              collectorSignature: sample.collectorSignature ?? "",
            })),
          }}
        />
      </>
    );
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
}
