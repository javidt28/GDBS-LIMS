import { AppFrame } from "@/components/shell";
import { navFor } from "@/server/permissions";
import { getStaff } from "@/server/session";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaff();
  if (!staff) return children;
  return (
    <AppFrame
      title="Staff workspace"
      items={navFor(staff.role)}
      accountName={staff.fullName}
      accountRole={staff.role.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
      realm="staff"
    >
      {children}
    </AppFrame>
  );
}
