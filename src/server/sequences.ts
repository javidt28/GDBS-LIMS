import type { Tx } from "./prisma";

export async function nextSequence(tx: Tx, key: string) {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "NumberSequence" ("key", "value")
    VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE
      SET "value" = "NumberSequence"."value" + 1
    RETURNING "value"
  `;
  return rows[0].value;
}

export function jobNumber(date: Date, lab: string, sequence: number) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const width = sequence > 99 ? 3 : 2;
  return `${y}${m}${d}${lab}${String(sequence).padStart(width, "0")}`;
}

export function certificateNumber(year: number, lab: string, sequence: number) {
  return `${year}${lab}${sequence}`;
}

export function requestReference(year: number, sequence: number) {
  return `SR-${year}-${String(sequence).padStart(4, "0")}`;
}
