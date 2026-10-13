import { AppFrame } from "@/components/shell";
import { navFor } from "@/server/permissions";
import { getStaff } from "@/server/session";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaff();
  if (!staff) return children;
  return (
    <AppFrame
      title="GDBS internal"
      items={navFor(staff.role)}
      accountLabel={`${staff.fullName} · ${staff.role.replaceAll("_", " ")}`}
      realm="staff"
    >
      {children}
    </AppFrame>
  );
}
