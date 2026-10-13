import { Empty, PageHeading } from "@/components/shell";
import { can } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "clients.read")) return <Empty>You do not have permission to view clients.</Empty>;
  const q = (await searchParams).q?.trim() ?? "";
  const clients = await prisma.clientAccount.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
    include: { _count: { select: { requests: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeading title="Clients" />
      <form className="search-row" method="get"><label style={{ flex: 1 }}>Search<input name="q" defaultValue={q} /></label><button className="btn">Search</button></form>
      {clients.length === 0 ? <Empty>No client accounts.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Email</th><th>Requests</th></tr></thead>
            <tbody>{clients.map((client) => <tr key={client.id}><td>{client.name || "Profile not completed"}</td><td>{client.kind}</td><td>{client.email}</td><td>{client._count.requests}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
