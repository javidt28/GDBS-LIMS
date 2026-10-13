import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashToken, newToken } from "./crypto";
import { prisma } from "./prisma";

const CLIENT_COOKIE = "gdbs_client";
const STAFF_COOKIE = "gdbs_staff";
const MAX_AGE = 60 * 60 * 24 * 12;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  };
}

export async function startClientSession(userId: string) {
  const token = newToken();
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      realm: "CLIENT",
      clientUserId: userId,
      expiresAt: new Date(Date.now() + MAX_AGE * 1000),
    },
  });
  const jar = await cookies();
  jar.set(CLIENT_COOKIE, token, cookieOptions());
}

export async function startStaffSession(userId: string) {
  const token = newToken();
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      realm: "STAFF",
      staffUserId: userId,
      expiresAt: new Date(Date.now() + MAX_AGE * 1000),
    },
  });
  const jar = await cookies();
  jar.set(STAFF_COOKIE, token, cookieOptions());
}

export async function clearClientSession() {
  const jar = await cookies();
  const token = jar.get(CLIENT_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(CLIENT_COOKIE);
}

export async function clearStaffSession() {
  const jar = await cookies();
  const token = jar.get(STAFF_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(STAFF_COOKIE);
}

export async function getClient() {
  const token = (await cookies()).get(CLIENT_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { clientUser: { include: { account: true } } },
  });
  if (!session?.clientUser || session.expiresAt < new Date() || session.clientUser.disabledAt) return null;
  return session.clientUser;
}

export async function getStaff() {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { staffUser: true },
  });
  if (!session?.staffUser || session.expiresAt < new Date() || session.staffUser.disabledAt) return null;
  return session.staffUser;
}

export async function requireClient() {
  const user = await getClient();
  if (!user) redirect("/sign-in");
  return user;
}

export async function requireStaff() {
  const user = await getStaff();
  if (!user) redirect("/internal/sign-in");
  return user;
}
