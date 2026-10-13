import { prisma, type Tx } from "./prisma";

type Db = Tx | typeof prisma;

export async function notify(
  db: Db,
  input: {
    clientUserId?: string | null;
    staffUserId?: string | null;
    kind: string;
    title: string;
    body: string;
    href?: string;
    dedupeKey?: string;
  },
) {
  if (input.dedupeKey) {
    const existing = await db.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (existing) return existing;
  }
  return db.notification.create({
    data: {
      clientUserId: input.clientUserId ?? null,
      staffUserId: input.staffUserId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href,
      dedupeKey: input.dedupeKey,
    },
  });
}
