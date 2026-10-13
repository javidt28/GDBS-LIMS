import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportKind } from "@prisma/client";
import { REPORT_WARRANTY, TEMPLATE_META, UNCERTAINTY_STATEMENT, matchTemplateRow } from "@/lib/catalogue";
import { audit } from "./audit";
import type { StaffActor } from "./accounts";
import { DomainError } from "./errors";
import { notify } from "./notify";
import { assertCan } from "./permissions";
import { prisma } from "./prisma";
import { certificateNumber, nextSequence } from "./sequences";
import { readPrivateBytes, savePrivateBytes } from "./storage";

const FOOTER_CONTACT = "P.O. Box 2036, Queen's Park, St. George's, Grenada  Tel: (473) 440-5886/6783  Fax: (473) 440-5554  Email: gdbs@spiceisle.com  Website: www.gdbs.gd";

export async function issueReport(actor: StaffActor, jobId: string, kind: ReportKind) {
  assertCan(actor.role, "reports.issue");
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      sample: { include: { request: true } },
      analyses: { include: { result: true }, orderBy: { sortOrder: "asc" } },
      envConditions: { where: { supersededAt: null }, orderBy: { revision: "desc" }, take: 1 },
      verification: true,
      reports: { where: { status: "ISSUED" }, orderBy: { revision: "desc" } },
    },
  });
  if (!job) throw new DomainError("Work order not found.", "NOT_FOUND");
  if (job.status !== "VERIFIED" || !job.verification?.verifiedAt) {
    throw new DomainError("The work order must be verified before a report is issued.");
  }
  const enterers = new Set(job.analyses.map((analysis) => analysis.result?.enteredById).filter(Boolean));
  if (enterers.has(actor.id)) {
    throw new DomainError("The person who entered the results cannot issue the report.");
  }
  const meta = TEMPLATE_META[kind];
  const performerIds = [...enterers] as string[];
  const performers = await prisma.staffUser.findMany({ where: { id: { in: performerIds } } });
  const env = job.envConditions[0];
  const year = new Date().getUTCFullYear();
  const previous = job.reports[0];
  const sampleIndex = 1;

  const rows = job.analyses.map((analysis) => {
    const matched = matchTemplateRow(kind, analysis.name);
    return {
      analysis: analysis.name,
      requirement: analysis.result?.requirementText || matched?.requirement || "—",
      actual: analysis.result?.actualValue || "—",
      uncertainty: analysis.result?.uncertainty || matched?.uncertainty || "—",
      comments: analysis.result?.comments || "—",
    };
  });

  const content = {
    formNo: meta.formNo,
    version: meta.version,
    formDate: meta.dateIssued,
    title: meta.title,
    laboratory: meta.laboratory,
    clientName: job.sample.request?.clientName || "—",
    clientAddress: job.sample.request?.clientAddress || "—",
    sampleDescription: job.sample.description,
    brandName: job.sample.brandName || "—",
    manufacturer: job.sample.manufacturer || "—",
    lotNo: job.sample.lotNo || "—",
    bestBefore: formatDay(job.sample.bestBefore),
    sizeQuantity: job.sample.sizeQuantity || "—",
    history: job.sample.history || "—",
    dateSampled: formatDay(job.sample.dateSampled),
    dateCollected: formatDay(job.sample.dateCollected),
    dateOfAnalysis: [formatDay(job.dateStarted), formatDay(job.dateCompleted)].filter((value) => value !== "—").join(" to ") || "—",
    analysisPerformed: meta.analysisPerformed,
    placeOfAnalysis: job.placeOfAnalysis || "—",
    procedures: job.procedures || "—",
    standard: meta.standard,
    rows,
    temperature: formatPair(env?.tempStartC?.toString(), env?.tempEndC?.toString(), "°C"),
    humidity: formatPair(env?.humidityStart?.toString(), env?.humidityEnd?.toString(), "%"),
    performedBy: performers.map((person) => person.fullName).join(", ") || "—",
    approvedBy: actor.fullName,
    approvedRole: "Head: Technical Services",
    warranty: REPORT_WARRANTY,
    uncertaintyStatement: UNCERTAINTY_STATEMENT,
    supersedes: previous?.certificateNo ?? null,
  };

  return prisma.$transaction(async (tx) => {
    const sequence = await nextSequence(tx, `cert:${year}:${job.lab}`);
    const certificateNo = certificateNumber(year, job.lab, sequence);
    const pdf = await renderPdf({ ...content, certificateNo, sampleIndex: String(sampleIndex).padStart(3, "0"), issuedAt: new Date().toISOString().slice(0, 10) });
    const stored = await savePrivateBytes(pdf, ".pdf");
    if (previous) {
      await tx.report.update({
        where: { id: previous.id },
        data: { status: "SUPERSEDED", supersededAt: new Date() },
      });
    }
    const report = await tx.report.create({
      data: {
        jobId: job.id,
        kind,
        status: "ISSUED",
        certificateNo,
        lab: job.lab,
        certYear: year,
        yearSequence: sequence,
        sampleIndex,
        revision: (previous?.revision ?? 0) + 1,
        revisionOfId: previous?.id,
        storageKey: stored.key,
        sha256: stored.sha256,
        content: { ...content, certificateNo },
        issuedById: actor.id,
      },
    });
    await tx.job.update({ where: { id: job.id }, data: { status: "REPORT_ISSUED" } });
    if (job.sample.requestId && job.serviceClass === "TECHNICAL_SERVICES" && job.sample.origin === "CLIENT_REQUEST") {
      const openJobs = await tx.job.count({
        where: {
          sample: { requestId: job.sample.requestId },
          serviceClass: "TECHNICAL_SERVICES",
          status: { notIn: ["REPORT_ISSUED", "CANCELLED"] },
        },
      });
      if (openJobs === 0) {
        await tx.serviceRequest.update({ where: { id: job.sample.requestId }, data: { status: "COMPLETED" } });
      }
      if (job.sample.request?.submittedById) {
        await notify(tx, {
          clientUserId: job.sample.request.submittedById,
          kind: "REPORT_ISSUED",
          title: previous ? "Revised report issued" : "Report issued",
          body: previous
            ? `${certificateNo} supersedes ${previous.certificateNo}.`
            : `${certificateNo} is available.`,
          href: `/portal/reports/${report.id}`,
          dedupeKey: `report.issued:${report.id}`,
        });
      }
    }
    await audit(tx, {
      entity: "Report",
      entityId: report.id,
      action: previous ? "report.revise" : "report.issue",
      actorId: actor.id,
      actorType: "STAFF",
      after: { certificateNo, revision: report.revision, supersedes: previous?.certificateNo ?? null },
    });
    return report;
  });
}

export async function openReportCorrection(actor: StaffActor, reportId: string, reason: string) {
  assertCan(actor.role, "reports.revise");
  if (!reason.trim()) throw new DomainError("Record the reason for the correction.", "VALIDATION");
  const report = await prisma.report.findUnique({ where: { id: reportId }, include: { job: { include: { verification: true } } } });
  if (!report || report.status !== "ISSUED") throw new DomainError("Only the current issued report can be corrected.", "NOT_FOUND");
  await prisma.$transaction(async (tx) => {
    const before = report.job.verification;
    if (before) {
      await audit(tx, {
        entity: "Verification",
        entityId: report.jobId,
        action: "verification.reset_for_correction",
        actorId: actor.id,
        actorType: "STAFF",
        before: {
          submittedById: before.submittedById,
          verifiedById: before.verifiedById,
          verifiedAt: before.verifiedAt?.toISOString() ?? null,
        },
        reason,
      });
      await tx.verification.delete({ where: { jobId: report.jobId } });
    }
    await tx.job.update({ where: { id: report.jobId }, data: { status: "IN_ANALYSIS" } });
    await audit(tx, {
      entity: "Report",
      entityId: report.id,
      action: "report.correction_opened",
      actorId: actor.id,
      actorType: "STAFF",
      reason,
      after: { certificateNo: report.certificateNo },
    });
  });
}

export async function readIssuedReport(reportId: string, accountId?: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { job: { include: { sample: { include: { request: true } } } } },
  });
  if (!report) throw new DomainError("Report not found.", "NOT_FOUND");
  if (accountId) {
    const sample = report.job.sample;
    const visible =
      sample.origin === "CLIENT_REQUEST" &&
      sample.accountId === accountId &&
      report.job.serviceClass === "TECHNICAL_SERVICES" &&
      sample.requestId != null;
    if (!visible) throw new DomainError("Report not found.", "NOT_FOUND");
  }
  const bytes = await readPrivateBytes(report.storageKey);
  return { report, bytes };
}

async function renderPdf(input: {
  title: string;
  laboratory: string;
  formNo: string;
  version: string;
  formDate: string;
  certificateNo: string;
  sampleIndex: string;
  issuedAt: string;
  clientName: string;
  clientAddress: string;
  sampleDescription: string;
  brandName: string;
  manufacturer: string;
  lotNo: string;
  bestBefore: string;
  sizeQuantity: string;
  history: string;
  dateSampled: string;
  dateCollected: string;
  dateOfAnalysis: string;
  analysisPerformed: string;
  placeOfAnalysis: string;
  procedures: string;
  standard: string;
  rows: { analysis: string; requirement: string; actual: string; uncertainty: string; comments: string }[];
  temperature: string;
  humidity: string;
  performedBy: string;
  approvedBy: string;
  approvedRole: string;
  warranty: string;
  uncertaintyStatement: string;
  supersedes: string | null;
}) {
  const pdf = await PDFDocument.create();
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const left = 48;
  const width = 500;

  const draw = (text: string, options?: { bold?: boolean; size?: number }) => {
    const size = options?.size ?? 9;
    const face = options?.bold ? bold : font;
    const lines = wrap(text, face, size, width);
    for (const line of lines) {
      if (y < 64) {
        page = pdf.addPage(pageSize);
        y = 800;
      }
      page.drawText(line, { x: left, y, size, font: face, color: rgb(0.1, 0.1, 0.1) });
      y -= size + 3;
    }
  };

  draw("GRENADA BUREAU OF STANDARDS", { bold: true, size: 12 });
  draw(input.laboratory, { bold: true, size: 10 });
  draw(FOOTER_CONTACT, { size: 8 });
  y -= 8;
  draw(input.title, { bold: true, size: 14 });
  draw(`Certificate / Report No. ${input.certificateNo}/${input.sampleIndex}`);
  draw(`Date of issue ${input.issuedAt}`);
  if (input.supersedes) draw(`This document supersedes ${input.supersedes}. The earlier document remains on record.`);
  y -= 6;
  draw("Client", { bold: true });
  draw(`${input.clientName}`);
  draw(input.clientAddress);
  y -= 4;
  draw("Sample", { bold: true });
  draw(`Product / sample: ${input.sampleDescription}`);
  draw(`Brand: ${input.brandName}`);
  draw(`Manufacturer: ${input.manufacturer}`);
  draw(`Batch / lot: ${input.lotNo}`);
  draw(`Best before: ${input.bestBefore}`);
  draw(`Size / quantity: ${input.sizeQuantity}`);
  draw(`Sample history: ${input.history}`);
  draw(`Date sampled: ${input.dateSampled}`);
  draw(`Date collected: ${input.dateCollected}`);
  y -= 4;
  draw("Service", { bold: true });
  draw(`Date(s) of analysis: ${input.dateOfAnalysis}`);
  draw(`Analysis performed: ${input.analysisPerformed}`);
  draw(`Place of analysis: ${input.placeOfAnalysis}`);
  draw(`Procedure(s) used: ${input.procedures}`);
  draw(`Standard used: ${input.standard}`);
  y -= 4;
  draw("Results", { bold: true });
  for (const row of input.rows) {
    draw(`${row.analysis}`, { bold: true });
    draw(`Requirement: ${row.requirement}    Actual: ${row.actual}    Uncertainty (k=2): ${row.uncertainty}`);
    draw(`Comments: ${row.comments}`);
  }
  y -= 4;
  draw(input.uncertaintyStatement, { size: 8 });
  draw(`Temperature: ${input.temperature}    Humidity: ${input.humidity}`);
  y -= 6;
  draw(`Analysis performed by: ${input.performedBy}`);
  draw(`Approved by: ${input.approvedBy}`);
  draw(input.approvedRole);
  y -= 6;
  draw(input.warranty, { size: 8 });
  y -= 8;
  draw(`Form No. ${input.formNo}    Version ${input.version}    Date issued ${input.formDate}    Issued by Quality Manager`, { size: 8 });
  draw('"End of Report"', { size: 8 });
  return Buffer.from(await pdf.save());
}

function wrap(text: string, font: { widthOfTextAtSize: (text: string, size: number) => number }, size: number, max: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function formatDay(value: Date | null | undefined) {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

function formatPair(start?: string | null, end?: string | null, unit?: string) {
  if (!start && !end) return "—";
  return `${start ?? "—"} to ${end ?? "—"} ${unit ?? ""}`.trim();
}
