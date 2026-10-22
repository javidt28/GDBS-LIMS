import { NextResponse } from "next/server";
import type { ReportKind } from "@prisma/client";
import { DomainError } from "@/server/errors";
import { previewReport } from "@/server/reports";
import { getStaff } from "@/server/session";

const KINDS = new Set<ReportKind>(["CERTIFICATE_OF_ANALYSIS", "TEST_REPORT"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const kind = new URL(request.url).searchParams.get("kind") as ReportKind | null;
  if (!kind || !KINDS.has(kind)) return new NextResponse("Not found", { status: 404 });
  try {
    const bytes = await previewReport({ id: staff.id, role: staff.role, lab: staff.lab, fullName: staff.fullName }, id, kind);
    const filename = kind === "CERTIFICATE_OF_ANALYSIS" ? "draft-certificate-of-analysis.pdf" : "draft-test-report.pdf";
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === "FORBIDDEN" ? 403 : 404;
      return new NextResponse(error.message, { status });
    }
    throw error;
  }
}
