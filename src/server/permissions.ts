import type { StaffRole } from "@prisma/client";
import { DomainError } from "./errors";

const MATRIX: Record<StaffRole, readonly string[]> = {
  RECEPTION: [
    "requests.read",
    "requests.verify",
    "samples.receive",
    "jobs.create",
    "jobs.read",
    "clients.read",
    "documents.read",
  ],
  ANALYST: ["jobs.read", "results.write", "verification.submit"],
  TECHNICAL_OFFICER: ["jobs.read", "results.write", "verification.submit", "reports.read"],
  QUALITY_MANAGER: ["requests.read", "jobs.read", "verification.verify", "reports.read", "clients.read"],
  APPROVER: ["jobs.read", "reports.read", "reports.issue", "reports.revise", "verification.verify"],
  FINANCE: [
    "requests.read",
    "quotations.read",
    "quotations.manage",
    "payments.read",
    "payments.confirm",
    "fees.read",
  ],
  ADMINISTRATOR: ["*"],
};

export function can(role: StaffRole, permission: string) {
  const granted = MATRIX[role];
  return granted.includes("*") || granted.includes(permission);
}

export function assertCan(role: StaffRole, permission: string) {
  if (!can(role, permission)) {
    throw new DomainError("You do not have permission to do that.", "FORBIDDEN");
  }
}

export const NAV_ITEMS: { href: string; label: string; permission: string; group: string }[] = [
  { href: "/internal", label: "Dashboard", permission: "jobs.read", group: "Workspace" },
  { href: "/internal/work", label: "My work", permission: "jobs.read", group: "Workspace" },
  { href: "/internal/notifications", label: "Notifications", permission: "jobs.read", group: "Workspace" },
  { href: "/internal/requests", label: "Requests", permission: "requests.read", group: "Laboratory" },
  { href: "/internal/clients", label: "Clients", permission: "clients.read", group: "Laboratory" },
  { href: "/internal/jobs", label: "Work orders", permission: "jobs.read", group: "Laboratory" },
  { href: "/internal/reports", label: "Issued documents", permission: "reports.read", group: "Laboratory" },
  { href: "/internal/quotations", label: "Quotations", permission: "quotations.read", group: "Commercial" },
  { href: "/internal/payments", label: "Payments", permission: "payments.read", group: "Commercial" },
  { href: "/internal/fees", label: "Fee schedule", permission: "fees.read", group: "Commercial" },
  { href: "/internal/admin/users", label: "Users", permission: "admin.users", group: "Administration" },
  { href: "/internal/admin/numbering", label: "Numbering", permission: "admin.numbering", group: "Administration" },
  { href: "/internal/admin/audit", label: "Audit trail", permission: "admin.audit", group: "Administration" },
  { href: "/internal/admin/settings", label: "Settings", permission: "admin.settings", group: "Administration" },
];

export function navFor(role: StaffRole) {
  return NAV_ITEMS.filter((item) => {
    if (item.permission.startsWith("admin.")) return role === "ADMINISTRATOR";
    if (item.href === "/internal" || item.href === "/internal/work" || item.href === "/internal/notifications") {
      return can(role, "jobs.read") || can(role, "requests.read") || can(role, "payments.read");
    }
    return can(role, item.permission);
  });
}
