import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/public-frame";
import { PUBLIC_LABORATORIES } from "@/lib/catalogue";
import Link from "next/link";

export const metadata: Metadata = { title: "Services" };

export default function ServicesPage() {
  return (
    <>
      <PublicHeader current="/services" />
      <main id="content" className="section">
        <h1 className="page-title">Services</h1>
        <p className="lede">The catalogue below follows the laboratory services published on gdbs.gd. This portal does not invent prices, turnaround times, or accreditation claims.</p>
        <div className="grid-2" style={{ marginTop: "1.25rem" }}>
          {PUBLIC_LABORATORIES.map((service) => (
            <article key={service.name} className="panel">
              <h2>{service.name}</h2>
              <p>{service.summary}</p>
              <p className="help">Requirements and documents are confirmed on the service request. No fee is shown here because GDBS has not approved a rate for this service in the system.</p>
              <Link className="btn" href="/create-account">Request a service</Link>
            </article>
          ))}
        </div>
        <article className="panel" style={{ marginTop: "1rem" }}>
          <h2>Label certification</h2>
          <p>gdbs.gd publishes label certification at $15 per label. The application form for that service is not part of the laboratory forms in this release, so it cannot be submitted here yet.</p>
        </article>
      </main>
      <PublicFooter />
    </>
  );
}
