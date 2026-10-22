import Link from "next/link";
import type { AccountKind, Prisma } from "@prisma/client";
import { Empty, PageHeading } from "@/components/shell";
import { can } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";
import { clientListInclude, clientsHref, ClientsTable, OPEN_REQUEST_STATUSES } from "./clients-table";

const FILTER_TABS = [
  ["", "All"],
  ["organizations", "Organizations"],
  ["individuals", "Individuals"],
  ["incomplete", "Incomplete"],
  ["open", "Open requests"],
] as const;

function isFilter(value: string | undefined): value is (typeof FILTER_TABS)[number][0] {
  return FILTER_TABS.some(([key]) => key && key === value);
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const staff = await requireStaff();
  if (!can(staff.role, "clients.read")) return <Empty>You do not have permission to view clients.</Empty>;
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const filter = isFilter(query.filter) ? query.filter : undefined;
  const searched: Prisma.ClientAccountWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { contactPerson: { contains: q, mode: "insensitive" } },
          { contactNo: { contains: q, mode: "insensitive" } },
          { address: { contains: q, mode: "insensitive" } },
          { users: { some: { OR: [{ email: { contains: q, mode: "insensitive" } }, { fullName: { contains: q, mode: "insensitive" } }] } } },
        ],
      }
    : {};
  const filtered: Prisma.ClientAccountWhereInput =
    filter === "organizations"
      ? { kind: "ORGANIZATION" }
      : filter === "individuals"
        ? { kind: "INDIVIDUAL" }
        : filter === "incomplete"
          ? { profileCompletedAt: null }
          : filter === "open"
            ? { requests: { some: { status: { in: OPEN_REQUEST_STATUSES } } } }
            : {};

  const [clients, kindCounts, incomplete, openAccounts, total] = await Promise.all([
    prisma.clientAccount.findMany({
      where: { ...searched, ...filtered },
      include: clientListInclude,
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.clientAccount.groupBy({ by: ["kind"], _count: { _all: true } }),
    prisma.clientAccount.count({ where: { profileCompletedAt: null } }),
    prisma.clientAccount.count({ where: { requests: { some: { status: { in: OPEN_REQUEST_STATUSES } } } } }),
    prisma.clientAccount.count(),
  ]);
  const kindCount = (kind: AccountKind) => kindCounts.find((row) => row.kind === kind)?._count._all ?? 0;
  const cards = [
    { label: "Organizations", value: kindCount("ORGANIZATION"), filter: "organizations", tone: "teal" },
    { label: "Individuals", value: kindCount("INDIVIDUAL"), filter: "individuals", tone: "blue" },
    { label: "Incomplete profiles", value: incomplete, filter: "incomplete", tone: "amber" },
    { label: "Open requests", value: openAccounts, filter: "open", tone: "violet" },
  ];
  const tabCount = (value: string) => {
    if (!value) return total;
    if (value === "organizations") return kindCount("ORGANIZATION");
    if (value === "individuals") return kindCount("INDIVIDUAL");
    if (value === "incomplete") return incomplete;
    return openAccounts;
  };

  return (
    <>
      <PageHeading title="Clients" meta="Open a client to see contact details, portal logins, and their service requests." />

      <div className="stat-grid">
        {cards.map((card) => (
          <Link key={card.filter} href={clientsHref({ filter: card.filter, q })} className={`stat-card stat-${card.tone}`}>
            <span className="stat-label">{card.label}</span>
            <strong className="stat-value">{card.value}</strong>
            <span className="stat-link">View →</span>
          </Link>
        ))}
      </div>

      <form className="search-row" method="get">
        {filter && <input type="hidden" name="filter" value={filter} />}
        <label className="search-grow">Search<input name="q" defaultValue={q} placeholder="Name, contact, email, or phone" /></label>
        <button className="btn" type="submit">Search</button>
      </form>

      <nav className="tabs tabs-pill" aria-label="Filter clients">
        {FILTER_TABS.map(([value, label]) => (
          <Link key={label} href={clientsHref({ filter: value, q })} aria-current={(filter ?? "") === value ? "page" : undefined}>
            {label} ({tabCount(value)})
          </Link>
        ))}
      </nav>

      <ClientsTable
        clients={clients}
        empty={q || filter ? "No clients match these filters." : "No client accounts yet."}
      />
    </>
  );
}
