import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/components/public-frame";

export default function HomePage() {
  return (
    <>
      <PublicHeader current="/" />
      <main id="content">
        <section className="hero">
          <h1>Laboratory and technical services for Grenada.</h1>
          <p className="lede">
            Submit a service request, follow the work through sample receipt and testing, and collect the report issued by the Grenada Bureau of Standards.
          </p>
          <div className="row-actions" style={{ marginTop: "1.25rem" }}>
            <Link className="btn btn-primary" href="/create-account">Request a service</Link>
            <Link className="btn" href="/sign-in">Sign in</Link>
          </div>
        </section>
        <section className="section">
          <h2>Services</h2>
          <div className="grid-2">
            <article className="panel">
              <h3>Laboratory testing</h3>
              <p>Analytical chemistry, microbiology, and materials testing, as published by the Bureau. Rates are confirmed by GDBS before a quotation is issued.</p>
              <Link href="/services">View services</Link>
            </article>
            <article className="panel">
              <h3>How a request moves</h3>
              <p>Account, service request, sample receipt, testing, technical review, and the issued report. Payment terms are recorded only when GDBS has approved them.</p>
              <Link href="/how-it-works">How it works</Link>
            </article>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
