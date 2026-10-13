import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/public-frame";

export const metadata: Metadata = { title: "How it works" };

const steps = [
  "Create an account and verify the email address.",
  "Complete the client profile. An individual account does not have to belong to a business.",
  "Complete Form GDBS-QMF-004, Service Request Form. A draft can be saved, and the first request can be deferred.",
  "GDBS reviews the request and either acknowledges it, returns it, or rejects it with a reason.",
  "Where GDBS has approved a fee, a quotation can be issued. Acceptance terms must be configured before a client can accept. A rejection is recorded and kept.",
  "Payment, when a record exists, can be noted as cash, cheque, direct deposit, wire transfer, or to be invoiced. A payment reference is not a confirmed payment.",
  "Deliver the sample. GDBS records receipt on the sample receipt and work order.",
  "The laboratory records raw data, results, and the client request verification checklist.",
  "An authorised officer issues the report. Draft results are not visible to the client.",
];

export default function HowItWorksPage() {
  return (
    <>
      <PublicHeader current="/how-it-works" />
      <main id="content" className="section">
        <h1 className="page-title">How it works</h1>
        <p>Some clients may have different payment arrangements. Those arrangements are not applied unless GDBS has recorded them. Credit accounts and card payments are not available until GDBS approves the provider and the policy.</p>
        <ol className="steps">
          {steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </main>
      <PublicFooter />
    </>
  );
}
