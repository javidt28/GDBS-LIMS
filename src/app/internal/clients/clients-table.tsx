import Link from "next/link";
import type { Prisma, RequestStatus } from "@prisma/client";
import { formatDate, humanize } from "@/lib/format";
import { Empty } from "@/components/shell";

export const OPEN_REQUEST_STATUSES: RequestStatus[] = ["SUBMITTED", "RETURNED", "ACKNOWLEDGED"];

export const clientListInclude = {
  users: {
    select: { id: true, email: true, fullName: true, emailVerifiedAt: true, disabledAt: true },
    orderBy: { createdAt: "asc" as const },
  },
  requests: {
    select: { id: true, reference: true, status: true, submittedAt: true },
    orderBy: { updatedAt: "desc" as const },
    take: 1,
  },
  _count: { select: { requests: true, users: true } },
} satisfies Prisma.ClientAccountInclude;

export type ClientListRow = Prisma.ClientAccountGetPayload<{ include: typeof clientListInclude }>;

export function clientsHref(params: { filter?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.filter) search.set("filter", params.filter);
  if (params.q) search.set("q", params.q);
  const value = search.toString();
  return value ? `/internal/clients?${value}` : "/internal/clients";
}

export function accountState(client: { profileCompletedAt: Date | null; users: { emailVerifiedAt: Date | null; disabledAt: Date | null }[] }) {
  if (client.users.length > 0 && client.users.every((user) => user.disabledAt)) {
    return { label: "Disabled", className: "chip chip-bad" };
  }
  if (!client.profileCompletedAt) return { label: "Incomplete", className: "chip" };
  if (client.users.length > 0 && client.users.every((user) => !user.emailVerifiedAt)) {
    return { label: "Unverified", className: "chip" };
  }
  return { label: "Ready", className: "chip chip-good" };
}

export function ClientsTable({ clients, empty }: { clients: ClientListRow[]; empty: string }) {
  if (clients.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Contact</th>
            <th>Requests</th>
            <th>Portal users</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const latest = client.requests[0];
            const state = accountState(client);
            const title = client.name || client.contactPerson || "Profile not completed";
            return (
              <tr key={client.id}>
                <td className="cell-primary">
                  <Link href={`/internal/clients/${client.id}`}>{title}</Link>
                  <small className="cell-sub">
                    {[humanize(client.kind), client.contactPerson && client.contactPerson !== client.name ? client.contactPerson : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </td>
                <td>
                  {client.email || client.users[0]?.email || <span className="facts-none">No email</span>}
                  {(client.contactNo || client.address) && (
                    <small className="cell-sub">{client.contactNo || client.address}</small>
                  )}
                </td>
                <td>
                  {client._count.requests === 0 ? (
                    <span className="facts-none">None yet</span>
                  ) : (
                    <>
                      {client._count.requests}
                      {latest && (
                        <small className="cell-sub">
                          <Link href={`/internal/requests/${latest.id}`}>{latest.reference}</Link>
                          {" · "}
                          {latest.status.replaceAll("_", " ").toLowerCase()}
                        </small>
                      )}
                    </>
                  )}
                </td>
                <td>
                  {client._count.users === 0 ? (
                    <span className="facts-none">No logins</span>
                  ) : (
                    <>
                      {client._count.users}
                      <small className="cell-sub">{client.users[0]?.email}</small>
                    </>
                  )}
                </td>
                <td>
                  <span className={state.className}>{state.label}</span>
                  <small className="cell-sub">Added {formatDate(client.createdAt)}</small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
