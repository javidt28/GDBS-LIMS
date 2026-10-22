import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { Card, Empty, Facts, PageHeading, Status } from "@/components/shell";
import { can } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";
import { accountState, OPEN_REQUEST_STATUSES } from "../clients-table";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "clients.read")) return <Empty>You do not have permission to view clients.</Empty>;
  const { id } = await params;
  const [client, open] = await Promise.all([
    prisma.clientAccount.findUnique({
      where: { id },
      include: {
        _count: { select: { requests: true, users: true } },
        users: { orderBy: { createdAt: "asc" } },
        requests: {
          orderBy: { updatedAt: "desc" },
          take: 25,
          include: {
            quotations: { orderBy: { version: "desc" }, take: 1, select: { id: true, status: true, version: true } },
            payments: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true } },
            _count: { select: { samples: true } },
          },
        },
      },
    }),
    prisma.serviceRequest.count({ where: { accountId: id, status: { in: OPEN_REQUEST_STATUSES } } }),
  ]);
  if (!client) notFound();
  const state = accountState(client);
  const title = client.name || client.contactPerson || "Profile not completed";

  return (
    <>
      <PageHeading
        title={title}
        crumbs={[{ href: "/internal/clients", label: "Clients" }]}
        meta={<>{humanize(client.kind)}{client.contactPerson ? ` · ${client.contactPerson}` : ""}</>}
        action={<span className={state.className}>{state.label}</span>}
      />

      <div className="detail-grid">
        <div className="detail-main">
          <Card title="Client and contact">
            <Facts
              items={[
                ["Account type", humanize(client.kind)],
                ["Name", client.name],
                ["Contact person", client.contactPerson],
                ["Phone", client.contactNo],
                ["Email", client.email && <a href={`mailto:${client.email}`}>{client.email}</a>, true],
                ["Address", client.address, true],
              ]}
            />
          </Card>

          <Card title="Portal users">
            {client.users.length === 0 ? (
              <p className="card-note">No portal logins are attached to this account.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.users.map((user) => (
                      <tr key={user.id}>
                        <td className="cell-primary">{user.fullName}</td>
                        <td>{user.email}</td>
                        <td>
                          {user.disabledAt ? (
                            <span className="chip chip-bad">Disabled</span>
                          ) : user.emailVerifiedAt ? (
                            <span className="chip chip-good">Verified</span>
                          ) : (
                            <span className="chip">Unverified</span>
                          )}
                          <small className="cell-sub">Added {formatDate(user.createdAt)}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Service requests">
            {client.requests.length === 0 ? (
              <p className="card-note">This client has not submitted a service request.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>Samples</th>
                      <th>Invoice</th>
                      <th>Payment</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.requests.map((request) => {
                      const invoice = request.quotations[0];
                      const payment = request.payments[0];
                      return (
                        <tr key={request.id}>
                          <td className="cell-primary">
                            <Link href={`/internal/requests/${request.id}`}>{request.reference}</Link>
                            <small className="cell-sub">
                              {request.description
                                ? request.description.length > 80
                                  ? `${request.description.slice(0, 77)}…`
                                  : request.description
                                : request.submittedAt
                                  ? `Submitted ${formatDate(request.submittedAt)}`
                                  : "Draft"}
                            </small>
                          </td>
                          <td>{request._count.samples || <span className="facts-none">None</span>}</td>
                          <td>
                            {invoice ? (
                              <>
                                <Status value={invoice.status} />
                                <small className="cell-sub">Version {invoice.version}</small>
                              </>
                            ) : (
                              <span className="facts-none">None</span>
                            )}
                          </td>
                          <td>{payment ? <Status value={payment.status} /> : <span className="facts-none">None</span>}</td>
                          <td><Status value={request.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <aside className="detail-side">
          <Card title="Summary">
            <Facts
              items={[
                ["Status", <span key="state" className={state.className}>{state.label}</span>],
                ["Account type", humanize(client.kind)],
                ["Portal users", client._count.users],
                ["Requests", client._count.requests],
                ["Open requests", open],
                ["Profile completed", formatDateTime(client.profileCompletedAt)],
                ["Added", formatDateTime(client.createdAt)],
              ]}
            />
          </Card>
        </aside>
      </div>
    </>
  );
}
