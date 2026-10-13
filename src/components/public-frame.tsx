import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/contact", label: "Contact" },
];

export function PublicHeader({ current }: { current?: string }) {
  return (
    <header className="public-header">
      <Link href="/" className="brand">
        <img src="/brand/gdbs-logo.png" alt="" />
        <strong>Grenada Bureau of Standards</strong>
      </Link>
      <nav className="nav-links" aria-label="Primary">
        {links.map((link) => (
          <Link key={link.href} href={link.href} aria-current={current === link.href ? "page" : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="header-actions">
        <Link className="btn btn-quiet" href="/sign-in">Sign in</Link>
        <Link className="btn btn-primary" href="/create-account">Create account</Link>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div>
        <strong>Grenada Bureau of Standards</strong>
        <p>Queen’s Park, St. George’s, Grenada W.I.</p>
        <p>P.O. Box 2036, Queen’s Park, St. George’s, Grenada W.I.</p>
        <p>Tel: (473) 440-5886 · (473) 440-6783 · (473) 405-5886</p>
        <p>Email: gdbs@gdbs.gd</p>
      </div>
      <div>
        <p>Controlled laboratory documents still print gdbs@spiceisle.com and fax (473) 440-5554. Those details stay on issued reports until Quality issues a revised form.</p>
        <p>A provisional visual system is in use pending brand approval. The mark is the logo published on gdbs.gd.</p>
      </div>
    </footer>
  );
}
