import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/public-frame";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <>
      <PublicHeader current="/contact" />
      <main id="content" className="section">
        <h1 className="page-title">Contact</h1>
        <div className="panel">
          <p>Grenada Bureau of Standards</p>
          <p>Queen’s Park, St. George’s, Grenada W.I.</p>
          <p>Mailing address: P.O. Box 2036, Queen’s Park, St. George’s, Grenada W.I.</p>
          <p>Telephone: (473) 440-5886, (473) 440-6783, (473) 405-5886</p>
          <p>Email: <a href="mailto:gdbs@gdbs.gd">gdbs@gdbs.gd</a></p>
          <p className="help">Banking instructions for transfers have not been published into this system. Do not send payment to an account number shown anywhere except an instruction issued by GDBS.</p>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
