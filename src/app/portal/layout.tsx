import { AppFrame } from "@/components/shell";
import { requireClient } from "@/server/session";

const items = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/requests/new", label: "New service request" },
  { href: "/portal/requests", label: "My requests" },
  { href: "/portal/quotations", label: "Invoices" },
  { href: "/portal/payments", label: "Payments" },
  { href: "/portal/samples", label: "My samples" },
  { href: "/portal/reports", label: "Reports and certificates" },
  { href: "/portal/notifications", label: "Notifications" },
  { href: "/portal/account", label: "Account" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  return (
    <AppFrame title="Client portal" items={items} accountName={user.fullName} accountRole="Client" realm="client">
      {children}
    </AppFrame>
  );
}
