import type { LabCode, Prisma, ReportKind, StaffRole } from "@prisma/client";
import { REPORT_WARRANTY, TEMPLATE_META, UNCERTAINTY_STATEMENT, assessResult, matchTemplateRow } from "@/lib/catalogue";
import { audit } from "./audit";
import type { StaffActor } from "./accounts";
import { renderCertificatePdf, type CertificateContent } from "./certificate-pdf";
import { DomainError } from "./errors";
import { notify } from "./notify";
import { assertCan } from "./permissions";
import { prisma } from "./prisma";
import { certificateNumber, nextSequence } from "./sequences";
import { readPrivateBytes, savePrivateBytes } from "./storage";

const reportJobInclude = {
  sample: { include: { request: true } },
  analyses: { include: { result: true }, orderBy: { sortOrder: "asc" } },
  envConditions: { where: { supersededAt: null }, orderBy: { revision: "desc" }, take: 1 },
  verification: true,
  reports: { where: { status: "ISSUED" }, orderBy: { revision: "desc" } },
} satisfies Prisma.JobInclude;

type ReportJob = Prisma.JobGetPayload<{ include: typeof reportJobInclude }>;

const DISCIPLINE: Record<LabCode, string | null> = { AL: "Chemical Analysis", MBL: "Microbiological Analysis", EA: null };
const ROLE_TITLE: Partial<Record<StaffRole, string>> = { TECHNICAL_OFFICER: "Technical Officer", ANALYST: "Analyst" };

export async function issueReport(actor: StaffActor, jobId: string, kind: ReportKind) {
  assertCan(actor.role, "reports.issue");
  const job = await loadJobForReport(jobId);
  if (job.status !== "VERIFIED" || !job.verification?.verifiedAt) {
    throw new DomainError("The work order must be verified before a report is issued.");
  }
  if (enteredBy(job).includes(actor.id)) {
    throw new DomainError("The person who entered the results cannot issue the report.");
  }
  const year = new Date().getUTCFullYear();
  const previous = job.reports.find((report) => report.status === "ISSUED");
  const sampleIndex = 1;
  const content = await buildReportContent(job, kind, actor, previous?.certificateNo ?? null);

  return prisma.$transaction(async (tx) => {
    const sequence = await nextSequence(tx, `cert:${year}:${job.lab}`);
    const certificateNo = certificateNumber(year, job.lab, sequence);
    const pdf = await renderCertificatePdf({ ...content, certificateNo: `${certificateNo}/${String(sampleIndex).padStart(3, "0")}` });
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


/** Renders the certificate from the current recorded results without numbering, storing, or issuing it. */
export async function previewReport(actor: StaffActor, jobId: string, kind: ReportKind) {
  assertCan(actor.role, "jobs.read");
  const job = await loadJobForReport(jobId);
  const approver = job.verification?.verifiedById
    ? await prisma.staffUser.findUnique({ where: { id: job.verification.verifiedById } })
    : null;
  const previous = job.reports.find((report) => report.status === "ISSUED");
  const content = await buildReportContent(job, kind, approver ?? { fullName: "Pending approval" }, previous?.certificateNo ?? null);
  return renderCertificatePdf({ ...content, certificateNo: "Assigned on issue" }, { draft: true });
}

async function loadJobForReport(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: reportJobInclude });
  if (!job) throw new DomainError("Work order not found.", "NOT_FOUND");
  return job;
}

function enteredBy(job: ReportJob) {
  return [...new Set(job.analyses.map((analysis) => analysis.result?.enteredById).filter((id): id is string => Boolean(id)))];
}

async function buildReportContent(
  job: ReportJob,
  kind: ReportKind,
  approver: { fullName: string },
  supersedes: string | null,
): Promise<Omit<CertificateContent, "certificateNo">> {
  const meta = TEMPLATE_META[kind];
  const performerIds = enteredBy(job);
  const found = await prisma.staffUser.findMany({ where: { id: { in: performerIds } } });
  const performers = performerIds.map((id) => found.find((person) => person.id === id)).filter((person): person is NonNullable<typeof person> => Boolean(person));
  const env = job.envConditions[0];
  const usesTemplateStandard = job.analyses.some((analysis) => matchTemplateRow(kind, analysis.name));
  const rows = job.analyses.map((analysis) => {
    const matched = matchTemplateRow(kind, analysis.name);
    const requirement = analysis.result?.requirementText || matched?.requirement || "—";
    return {
      analysis: matched?.analysis || analysis.name,
      requirement,
      actual: analysis.result?.actualValue || "—",
      uncertainty: analysis.result?.uncertainty || matched?.uncertainty || "—",
      comments: analysis.result?.comments || assessResult(requirement, analysis.result?.actualValue) || "—",
    };
  });
  const lead = performers[0];
  const discipline = DISCIPLINE[job.lab];
  const leadTitle = lead ? ROLE_TITLE[lead.role] ?? "Laboratory" : "";
  return {
    formNo: meta.formNo,
    version: meta.version,
    formDate: meta.dateIssued,
    title: meta.title,
    laboratory: meta.laboratory,
    issuedAt: grenadaDay(new Date()),
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
    dateOfAnalysis: analysisDates(job.dateStarted, job.dateCompleted),
    analysisPerformed: job.analysisPerformed || meta.analysisPerformed,
    placeOfAnalysis: job.placeOfAnalysis || "—",
    procedures: job.procedures || "—",
    standard: job.standardUsed || (usesTemplateStandard ? meta.standard : "—"),
    rows,
    temperature: average(env?.tempStartC?.toString(), env?.tempEndC?.toString()),
    humidity: average(env?.humidityStart?.toString(), env?.humidityEnd?.toString()),
    performedBy: performers.map((person) => person.fullName).join(", ") || "—",
    performedRole: lead ? (discipline ? `${leadTitle}: ${discipline}` : leadTitle) : "",
    approvedBy: approver.fullName,
    approvedRole: "Head: Technical Services",
    warranty: REPORT_WARRANTY,
    uncertaintyStatement: UNCERTAINTY_STATEMENT,
    supersedes,
  };
}

function formatDay(value: Date | null | undefined) {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

function grenadaDay(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Grenada", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function analysisDates(start: Date | null, end: Date | null) {
  const first = start ? grenadaDay(start) : null;
  const last = end ? grenadaDay(end) : null;
  if (first && last && first !== last) return `${first} to ${last}`;
  return first ?? last ?? "—";
}

/** Laboratory conditions are reported as the mean of the start and end readings, as on the template. */
function average(start?: string | null, end?: string | null) {
  const values = [start, end].filter((value): value is string => Boolean(value)).map(Number).filter(Number.isFinite);
  if (values.length === 0) return "—";
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return String(Math.round(mean * 10) / 10);
}
