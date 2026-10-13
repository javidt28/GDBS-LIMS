import { Banner, PageHeading } from "@/components/shell";
import { RequestForm } from "@/components/request-form";
import { requireClient } from "@/server/session";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireClient();
  const query = await searchParams;
  return (
    <>
      <PageHeading title="New service request" crumbs={[{ href: "/portal/requests", label: "My requests" }]} />
      <Banner error={query.error} />
      <RequestForm
        initial={{
          clientName: user.account.name,
          clientAddress: user.account.address ?? "",
          contactPerson: user.account.contactPerson ?? user.fullName,
          contactNo: user.account.contactNo ?? "",
          contactEmail: user.email,
          serviceType: "",
          serviceTypeOther: "",
          description: "",
          decisionRuleAck: false,
          signatureName: "",
          samples: [],
        }}
      />
    </>
  );
}
