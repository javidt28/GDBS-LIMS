import Link from "next/link";
import { Banner } from "@/components/shell";

const copy = {
  client: {
    kicker: "Client portal",
    headline: "Laboratory testing, from request to report.",
    points: [
      "Submit a service request online",
      "Follow your sample through receipt and testing",
      "Download issued certificates and test reports",
    ],
  },
  staff: {
    kicker: "Staff workspace",
    headline: "Requests, work orders, and issued reports in one place.",
    points: [
      "Acknowledge requests and receive samples",
      "Record readings and results on the work order",
      "Verify and issue certificates and test reports",
    ],
  },
};

export function AuthShell({
  variant = "client",
  title,
  subtitle,
  error,
  ok,
  footer,
  children,
}: {
  variant?: "client" | "staff";
  title: string;
  subtitle?: string;
  error?: string;
  ok?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const text = copy[variant];
  return (
    <div className="auth">
      <aside className="auth-visual" aria-hidden="true">
        <Link href="/" className="auth-brand" tabIndex={-1}>
          <span className="auth-logo"><img src="/brand/gdbs-logo.png" alt="" /></span>
          <span>Grenada Bureau of Standards</span>
        </Link>
        <div className="auth-pitch">
          <p className="auth-kicker">{text.kicker}</p>
          <h2>{text.headline}</h2>
          <ul>
            {text.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <p className="auth-contact">Queen’s Park, St. George’s · (473) 440-5886 · gdbs@gdbs.gd</p>
      </aside>
      <main id="content" className="auth-main">
        <Link href="/" className="auth-back">← Back to the GDBS website</Link>
        <div className="auth-card">
          <img className="auth-card-logo" src="/brand/gdbs-logo.png" alt="Grenada Bureau of Standards" />
          <p className="auth-card-kicker">{text.kicker}</p>
          <h1>{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          <Banner error={error} ok={ok} />
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
