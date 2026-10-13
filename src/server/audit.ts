import type { ActorType, Prisma } from "@prisma/client";
import { prisma, type Tx } from "./prisma";

type Db = Tx | typeof prisma;

export async function audit(
  db: Db,
  input: {
    entity: string;
    entityId: string;
    action: string;
    actorId?: string | null;
    actorType: ActorType;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    reason?: string | null;
  },
) {
  await db.auditLog.create({
    data: {
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId ?? null,
      actorType: input.actorType,
      before: input.before,
      after: input.after,
      reason: input.reason ?? null,
    },
  });
}
