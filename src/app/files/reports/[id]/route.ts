import { NextResponse } from "next/server";
import { DomainError } from "@/server/errors";
import { readIssuedReport } from "@/server/reports";
import { getClient, getStaff } from "@/server/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient();
  const staff = client ? null : await getStaff();
  if (!client && !staff) return new NextResponse("Not found", { status: 404 });
  try {
    const { report, bytes } = await readIssuedReport(id, client?.accountId);
    const filename = `${report.certificateNo}.pdf`;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return new NextResponse("Not found", { status: 404 });
    throw error;
  }
}
