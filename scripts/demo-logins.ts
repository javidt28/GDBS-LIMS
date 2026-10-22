/**
 * Director demo logins used on both local and production.
 *
 *   npx tsx scripts/demo-logins.ts
 *   DATABASE_URL=... npx tsx scripts/demo-logins.ts
 *
 * Password for every account: GDBS-Demo-2026
 *   client@gdbs.gd      client portal   /sign-in
 *   admin@gdbs.gd       staff           /internal/sign-in
 *   approver@gdbs.gd    staff           /internal/sign-in
 */
import type { StaffRole } from "@prisma/client";

const PASSWORD = process.env.GDBS_DEMO_PASSWORD ?? "GDBS-Demo-2026";
const LOCAL_URL = "postgresql://gdbs:gdbs@127.0.0.1:54329/gdbs_lims";

process.env.DATABASE_URL ??= LOCAL_URL;

const isLocal = /127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL);

async function ensureStaff(
  email: string,
  fullName: string,
  role: StaffRole,
  passwordHash: string,
) {
  const { prisma } = await import("../src/server/prisma");
  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) {
    await prisma.staffUser.update({
      where: { id: existing.id },
      data: { passwordHash, fullName, role, disabledAt: null },
    });
    return "updated";
  }
  await prisma.staffUser.create({ data: { email, fullName, role, passwordHash } });
  return "created";
}

async function ensureClient(passwordHash: string) {
  const { prisma } = await import("../src/server/prisma");
  const email = "client@gdbs.gd";
  const profile = {
    kind: "ORGANIZATION" as const,
    name: "Island Produce Ltd",
    address: "Queen's Park, St. George's",
    contactPerson: "Robert Medford",
    contactNo: "473-440-5886",
    email,
    profileCompletedAt: new Date(),
  };
  const existing = await prisma.clientUser.findUnique({ where: { email } });
  if (existing) {
    await prisma.clientUser.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        fullName: "GDBS Client",
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        disabledAt: null,
      },
    });
    await prisma.clientAccount.update({ where: { id: existing.accountId }, data: profile });
    return "updated";
  }
  const account = await prisma.clientAccount.create({ data: profile });
  await prisma.clientUser.create({
    data: {
      accountId: account.id,
      email,
      passwordHash,
      fullName: "GDBS Client",
      emailVerifiedAt: new Date(),
    },
  });
  return "created";
}

async function main() {
  if (PASSWORD.length < 12) {
    console.error("GDBS_DEMO_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }
  if (isLocal) {
    const { prisma: probe } = await import("../src/server/prisma");
    try {
      await probe.$queryRaw`SELECT 1`;
    } catch {
      const { startPostgres } = await import("./postgres");
      await startPostgres();
    }
  }

  const { prisma } = await import("../src/server/prisma");
  const { hashPassword, verifyPassword } = await import("../src/server/crypto");
  const passwordHash = await hashPassword(PASSWORD);

  const results = [
    ["admin@gdbs.gd", await ensureStaff("admin@gdbs.gd", "GDBS Administrator", "ADMINISTRATOR", passwordHash)],
    ["approver@gdbs.gd", await ensureStaff("approver@gdbs.gd", "GDBS Approver", "APPROVER", passwordHash)],
    ["client@gdbs.gd", await ensureClient(passwordHash)],
  ];

  const admin = await prisma.staffUser.findUniqueOrThrow({ where: { email: "admin@gdbs.gd" } });
  const approver = await prisma.staffUser.findUniqueOrThrow({ where: { email: "approver@gdbs.gd" } });
  const client = await prisma.clientUser.findUniqueOrThrow({ where: { email: "client@gdbs.gd" } });
  const ok =
    (await verifyPassword(PASSWORD, admin.passwordHash)) &&
    (await verifyPassword(PASSWORD, approver.passwordHash)) &&
    (await verifyPassword(PASSWORD, client.passwordHash));
  if (!ok) throw new Error("Password verification failed after update.");

  console.log(isLocal ? "Local demo logins:" : "Production demo logins:");
  for (const [email, action] of results) console.log(`  ${email}  ${action}`);
  console.log(`Password: ${PASSWORD}`);
  await prisma.$disconnect();
  process.exit(0);
}

void main();
