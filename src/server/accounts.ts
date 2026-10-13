import type { Prisma, StaffRole, LabCode } from "@prisma/client";
import { audit } from "./audit";
import { hashPassword, hashToken, newToken, verifyPassword } from "./crypto";
import { DomainError } from "./errors";
import { prisma } from "./prisma";
import { assertCan } from "./permissions";

const PASSWORD_MIN = 12;

export type StaffActor = { id: string; role: StaffRole; lab: LabCode | null; fullName: string };

export function assertPassword(password: string) {
  if (password.length < PASSWORD_MIN) {
    throw new DomainError(`Use at least ${PASSWORD_MIN} characters.`, "VALIDATION");
  }
}

export async function registerClient(input: {
  email: string;
  password: string;
  fullName: string;
}) {
  assertPassword(input.password);
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DomainError("Enter a valid email address.", "VALIDATION");
  }
  if (!input.fullName.trim()) throw new DomainError("Enter your name.", "VALIDATION");

  const existing = await prisma.clientUser.findUnique({ where: { email } });
  if (existing) throw new DomainError("An account with that email already exists.", "VALIDATION");

  const passwordHash = await hashPassword(input.password);
  const token = newToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  const user = await prisma.$transaction(async (tx) => {
    const account = await tx.clientAccount.create({
      data: { kind: "INDIVIDUAL", email, contactPerson: input.fullName.trim() },
    });
    const created = await tx.clientUser.create({
      data: {
        accountId: account.id,
        email,
        passwordHash,
        fullName: input.fullName.trim(),
      },
    });
    await tx.emailToken.create({
      data: {
        purpose: "VERIFY_EMAIL",
        email,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });
    await audit(tx, {
      entity: "ClientUser",
      entityId: created.id,
      action: "account.register",
      actorId: created.id,
      actorType: "CLIENT",
      after: { email },
    });
    return created;
  });

  return { userId: user.id, email, verifyToken: token };
}

export async function verifyEmail(token: string) {
  const record = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.purpose !== "VERIFY_EMAIL" || record.usedAt || record.expiresAt < new Date()) {
    throw new DomainError("This verification link is invalid or has expired.", "VALIDATION");
  }
  await prisma.$transaction(async (tx) => {
    await tx.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.clientUser.update({
      where: { email: record.email },
      data: { emailVerifiedAt: new Date() },
    });
  });
}

export async function authenticateClient(email: string, password: string) {
  const user = await prisma.clientUser.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { account: true },
  });
  if (!user || user.disabledAt || !(await verifyPassword(password, user.passwordHash))) {
    throw new DomainError("Email or password is incorrect.", "VALIDATION");
  }
  if (!user.emailVerifiedAt) {
    throw new DomainError("Verify your email before signing in.", "VALIDATION");
  }
  return user;
}

export async function authenticateStaff(email: string, password: string) {
  const user = await prisma.staffUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.disabledAt || !(await verifyPassword(password, user.passwordHash))) {
    throw new DomainError("Email or password is incorrect.", "VALIDATION");
  }
  return user;
}

export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.clientUser.findUnique({ where: { email: normalized } });
  if (!user) return { token: null as string | null };
  const token = newToken();
  await prisma.emailToken.create({
    data: {
      purpose: "RESET_PASSWORD",
      email: normalized,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    },
  });
  return { token };
}

export async function resetPassword(token: string, password: string) {
  assertPassword(password);
  const record = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.purpose !== "RESET_PASSWORD" || record.usedAt || record.expiresAt < new Date()) {
    throw new DomainError("This reset link is invalid or has expired.", "VALIDATION");
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    const user = await tx.clientUser.update({
      where: { email: record.email },
      data: { passwordHash },
    });
    await tx.session.deleteMany({ where: { clientUserId: user.id } });
    await audit(tx, {
      entity: "ClientUser",
      entityId: user.id,
      action: "account.password_reset",
      actorId: user.id,
      actorType: "CLIENT",
    });
  });
}

export async function updateClientProfile(
  userId: string,
  input: {
    kind: "INDIVIDUAL" | "ORGANIZATION";
    name: string;
    address?: string;
    contactPerson?: string;
    contactNo?: string;
    fullName: string;
  },
) {
  if (!input.name.trim()) throw new DomainError("Enter the client name.", "VALIDATION");
  if (!input.fullName.trim()) throw new DomainError("Enter your name.", "VALIDATION");
  if (input.kind === "ORGANIZATION" && !input.contactPerson?.trim()) {
    throw new DomainError("Enter a contact person for the organization.", "VALIDATION");
  }
  const user = await prisma.clientUser.findUniqueOrThrow({ where: { id: userId } });
  await prisma.$transaction(async (tx) => {
    await tx.clientAccount.update({
      where: { id: user.accountId },
      data: {
        kind: input.kind,
        name: input.name.trim(),
        address: empty(input.address),
        contactPerson: input.kind === "ORGANIZATION" ? input.contactPerson?.trim() : input.fullName.trim(),
        contactNo: empty(input.contactNo),
        profileCompletedAt: new Date(),
      },
    });
    await tx.clientUser.update({
      where: { id: userId },
      data: { fullName: input.fullName.trim() },
    });
    await audit(tx, {
      entity: "ClientAccount",
      entityId: user.accountId,
      action: "account.profile_update",
      actorId: userId,
      actorType: "CLIENT",
    });
  });
}

export async function createStaffUser(
  actor: StaffActor,
  input: { email: string; fullName: string; password: string; role: StaffRole; lab?: LabCode | null },
) {
  assertCan(actor.role, "admin.users");
  assertPassword(input.password);
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const created = await prisma.$transaction(async (tx) => {
    const staff = await tx.staffUser.create({
      data: {
        email,
        fullName: input.fullName.trim(),
        passwordHash,
        role: input.role,
        lab: input.lab ?? null,
      },
    });
    await audit(tx, {
      entity: "StaffUser",
      entityId: staff.id,
      action: "staff.create",
      actorId: actor.id,
      actorType: "STAFF",
      after: { email, role: input.role, lab: input.lab ?? null },
    });
    return staff;
  });
  return created;
}

export async function bootstrapAdministrator(input: { email: string; password: string; fullName: string }) {
  const count = await prisma.staffUser.count();
  if (count > 0) throw new DomainError("A staff account already exists.");
  assertPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  return prisma.staffUser.create({
    data: {
      email: input.email.trim().toLowerCase(),
      passwordHash,
      fullName: input.fullName.trim(),
      role: "ADMINISTRATOR",
    },
  });
}

function empty(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export type ProfileInput = Prisma.ClientAccountUpdateInput;
