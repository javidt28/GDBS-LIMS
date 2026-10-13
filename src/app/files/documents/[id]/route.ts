import { NextResponse } from "next/server";
import { getClient } from "@/server/session";
import { prisma } from "@/server/prisma";
import { readPrivateBytes } from "@/server/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getClient();
  if (!user) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const document = await prisma.document.findFirst({
    where: { id, request: { accountId: user.accountId } },
  });
  if (!document) return new NextResponse("Not found", { status: 404 });
  const bytes = await readPrivateBytes(document.storageKey);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `attachment; filename="${document.filename.replaceAll('"', "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
