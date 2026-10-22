import type { AnalysisBasis, LabCode, Prisma, ServiceClass } from "@prisma/client";
import { assessResult } from "@/lib/catalogue";
import { audit } from "./audit";
import type { StaffActor } from "./accounts";
import { DomainError } from "./errors";
import { notify } from "./notify";
import { assertCan } from "./permissions";
import { prisma } from "./prisma";
import { jobNumber, nextSequence } from "./sequences";

export async function receiveSample(
  actor: StaffActor,
  sampleId: string,
  input: {
    history?: string;
    storageLocation?: string;
    storedOn?: string;
    analysisBasis?: AnalysisBasis | "";
    analysisBasisOther?: string;
    sampleSize?: string;
    conditionNotes?: string;
    dateSampled?: string;
    dateCollected?: string;
  },
) {
  assertCan(actor.role, "samples.receive");
  const sample = await prisma.sample.findUnique({ where: { id: sampleId }, include: { request: true } });
  if (!sample) throw new DomainError("Sample not found.", "NOT_FOUND");
  const analysisBasis = input.analysisBasis;
  if (!analysisBasis) throw new DomainError("Select the analysis basis.", "VALIDATION");
  if (analysisBasis === "CLIENT_SPECIFIED" && !input.analysisBasisOther?.trim()) {
    throw new DomainError("Describe the client-specified analysis.", "VALIDATION");
  }
  const receivedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.sample.update({
      where: { id: sample.id },
      data: {
        history: empty(input.history),
        storageLocation: empty(input.storageLocation),
        storedOn: day(input.storedOn),
        analysisBasis,
        analysisBasisOther: analysisBasis === "CLIENT_SPECIFIED" ? empty(input.analysisBasisOther) : null,
        sampleSize: empty(input.sampleSize),
        conditionNotes: empty(input.conditionNotes),
        dateSampled: day(input.dateSampled),
        dateCollected: day(input.dateCollected),
        receivedAt,
        receivedById: actor.id,
      },
    });
    await audit(tx, {
      entity: "Sample",
      entityId: sample.id,
      action: "sample.receive",
      actorId: actor.id,
      actorType: "STAFF",
      after: { receivedAt: receivedAt.toISOString(), analysisBasis: input.analysisBasis },
    });
    if (sample.origin === "CLIENT_REQUEST" && sample.request?.submittedById) {
      await notify(tx, {
        clientUserId: sample.request.submittedById,
        kind: "SAMPLE_RECEIVED",
        title: "Sample received",
        body: `A sample for ${sample.request.reference} was received by GDBS.`,
        href: `/portal/requests/${sample.request.id}`,
        dedupeKey: `sample.received:${sample.id}`,
      });
    }
    return row;
  });
  return updated;
}

export async function createJob(
  actor: StaffActor,
  input: {
    sampleId: string;
    lab: LabCode;
    jobDate: string;
    serviceClass: ServiceClass;
    analysisNames: string[];
    procedures?: string;
    placeOfAnalysis?: string;
    standardUsed?: string;
    analysisPerformed?: string;
    assigneeId?: string;
  },
) {
  assertCan(actor.role, "jobs.create");
  const names = [...new Set(input.analysisNames.map((name) => name.trim()).filter(Boolean))];
  if (names.length === 0) throw new DomainError("Select at least one analysis.", "VALIDATION");
  const sample = await prisma.sample.findUnique({ where: { id: input.sampleId } });
  if (!sample) throw new DomainError("Sample not found.", "NOT_FOUND");
  if (!sample.receivedAt) throw new DomainError("Receive the sample before opening a work order.");
  const serviceClass = requiredServiceClass(sample.origin, input.serviceClass);
  const date = day(input.jobDate);
  if (!date) throw new DomainError("Enter the job date.", "VALIDATION");

  return prisma.$transaction(async (tx) => {
    const key = `job:${date.toISOString().slice(0, 10)}:${input.lab}`;
    const sequence = await nextSequence(tx, key);
    const job = await tx.job.create({
      data: {
        jobNo: jobNumber(date, input.lab, sequence),
        daySequence: sequence,
        jobDate: date,
        lab: input.lab,
        serviceClass,
        sampleId: sample.id,
        procedures: empty(input.procedures),
        placeOfAnalysis: empty(input.placeOfAnalysis),
        standardUsed: empty(input.standardUsed),
        analysisPerformed: empty(input.analysisPerformed),
        assigneeId: input.assigneeId || actor.id,
        analyses: {
          create: names.map((name, index) => ({ name, sortOrder: index })),
        },
      },
    });
    await audit(tx, {
      entity: "Job",
      entityId: job.id,
      action: "job.create",
      actorId: actor.id,
      actorType: "STAFF",
      after: { jobNo: job.jobNo, lab: job.lab, serviceClass: job.serviceClass },
    });
    return job;
  });
}

export async function saveJobDetails(
  actor: StaffActor,
  jobId: string,
  input: { procedures?: string; placeOfAnalysis?: string; standardUsed?: string; analysisPerformed?: string },
) {
  assertCan(actor.role, "results.write");
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new DomainError("Work order not found.", "NOT_FOUND");
  assertJobEditable(job.status);
  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: jobId },
      data: {
        procedures: empty(input.procedures),
        placeOfAnalysis: empty(input.placeOfAnalysis),
        standardUsed: empty(input.standardUsed),
        analysisPerformed: empty(input.analysisPerformed),
      },
    });
    await audit(tx, {
      entity: "Job",
      entityId: jobId,
      action: "job.details.save",
      actorId: actor.id,
      actorType: "STAFF",
      after: {
        procedures: empty(input.procedures),
        placeOfAnalysis: empty(input.placeOfAnalysis),
        standardUsed: empty(input.standardUsed),
        analysisPerformed: empty(input.analysisPerformed),
      },
    });
  });
}

export async function saveReadings(
  actor: StaffActor,
  analysisId: string,
  input: {
    readings: { testNo: number; reading: string; roomEquipTempC?: string; weightG?: string }[];
    equipmentTag?: string;
    reason?: string;
  },
) {
  assertCan(actor.role, "results.write");
  const analysis = await loadAnalysis(analysisId);
  assertJobEditable(analysis.job.status);
  const rows = input.readings.filter((row) => row.reading.trim());
  if (rows.length === 0 || rows.length > 5) {
    throw new DomainError("Enter between 1 and 5 readings.", "VALIDATION");
  }
  const locked = Boolean(analysis.result?.lockedAt);
  if (locked && !input.reason?.trim()) {
    throw new DomainError("A reviewed result cannot be overwritten without a reason.", "VALIDATION");
  }
  await prisma.$transaction(async (tx) => {
    const current = await tx.rawReading.findMany({ where: { jobAnalysisId: analysisId, supersededAt: null } });
    const revision = (current[0]?.revision ?? 0) + (locked ? 1 : 0);
    if (locked) {
      await tx.rawReading.updateMany({
        where: { jobAnalysisId: analysisId, supersededAt: null },
        data: { supersededAt: new Date() },
      });
    } else if (current.length) {
      await tx.rawReading.deleteMany({ where: { jobAnalysisId: analysisId, supersededAt: null } });
    }
    await tx.rawReading.createMany({
      data: rows.map((row) => ({
        jobAnalysisId: analysisId,
        revision: locked ? revision : current[0]?.revision ?? 1,
        testNo: row.testNo,
        reading: row.reading.trim(),
        roomEquipTempC: decimal(row.roomEquipTempC),
        weightG: decimal(row.weightG),
        equipmentTag: empty(input.equipmentTag),
        performedById: actor.id,
      })),
    });
    if (analysis.job.status === "CREATED") {
      await tx.job.update({
        where: { id: analysis.jobId },
        data: { status: "IN_ANALYSIS", dateStarted: new Date() },
      });
    }
    await audit(tx, {
      entity: "JobAnalysis",
      entityId: analysisId,
      action: locked ? "reading.correct" : "reading.save",
      actorId: actor.id,
      actorType: "STAFF",
      reason: input.reason,
    });
  });
}

export async function saveResult(
  actor: StaffActor,
  analysisId: string,
  input: {
    actualValue: string;
    units?: string;
    requirementText?: string;
    uncertainty?: string;
    comments?: string;
    reason?: string;
  },
) {
  assertCan(actor.role, "results.write");
  if (!input.actualValue.trim()) throw new DomainError("Enter the result.", "VALIDATION");
  const analysis = await loadAnalysis(analysisId);
  assertJobEditable(analysis.job.status);
  const actualValue = input.actualValue.trim();
  const requirementText = empty(input.requirementText);
  const comments = empty(input.comments) ?? assessResult(requirementText, actualValue);
  const locked = Boolean(analysis.result?.lockedAt);
  if (locked && !input.reason?.trim()) {
    throw new DomainError("A reviewed result cannot be overwritten without a reason.", "VALIDATION");
  }
  await prisma.$transaction(async (tx) => {
    if (analysis.result && locked) {
      await tx.resultRevision.create({
        data: {
          jobAnalysisId: analysisId,
          revision: analysis.result.revision,
          actualValue: analysis.result.actualValue,
          units: analysis.result.units,
          requirementText: analysis.result.requirementText,
          uncertainty: analysis.result.uncertainty,
          comments: analysis.result.comments,
          reason: input.reason!.trim(),
          correctedById: actor.id,
        },
      });
      await tx.result.update({
        where: { jobAnalysisId: analysisId },
        data: {
          revision: analysis.result.revision + 1,
          actualValue,
          units: empty(input.units),
          requirementText,
          uncertainty: empty(input.uncertainty),
          comments,
          enteredById: actor.id,
          enteredAt: new Date(),
          lockedAt: null,
        },
      });
    } else if (analysis.result) {
      await tx.result.update({
        where: { jobAnalysisId: analysisId },
        data: {
          actualValue,
          units: empty(input.units),
          requirementText,
          uncertainty: empty(input.uncertainty),
          comments,
          enteredById: actor.id,
          enteredAt: new Date(),
        },
      });
    } else {
      await tx.result.create({
        data: {
          jobAnalysisId: analysisId,
          actualValue,
          units: empty(input.units),
          requirementText,
          uncertainty: empty(input.uncertainty),
          comments,
          enteredById: actor.id,
        },
      });
    }
    const job = await tx.job.findUniqueOrThrow({
      where: { id: analysis.jobId },
      include: { analyses: { include: { result: true } } },
    });
    const complete = job.analyses.every((item) => item.result);
    if (complete && (job.status === "IN_ANALYSIS" || job.status === "CREATED")) {
      await tx.job.update({ where: { id: job.id }, data: { status: "RESULTS_ENTERED", dateStarted: job.dateStarted ?? new Date() } });
    } else if (job.status === "CREATED") {
      await tx.job.update({ where: { id: job.id }, data: { status: "IN_ANALYSIS", dateStarted: job.dateStarted ?? new Date() } });
    }
    await audit(tx, {
      entity: "Result",
      entityId: analysisId,
      action: locked ? "result.correct" : "result.save",
      actorId: actor.id,
      actorType: "STAFF",
      reason: input.reason,
      after: { actualValue, comments },
    });
  });
}

export async function saveEnvironment(
  actor: StaffActor,
  jobId: string,
  input: { tempStartC?: string; tempEndC?: string; humidityStart?: string; humidityEnd?: string; reason?: string },
) {
  assertCan(actor.role, "results.write");
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { envConditions: { where: { supersededAt: null }, take: 1 } } });
  if (!job) throw new DomainError("Work order not found.", "NOT_FOUND");
  assertJobEditable(job.status);
  const current = job.envConditions[0];
  await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.envCondition.update({ where: { id: current.id }, data: { supersededAt: new Date() } });
    }
    await tx.envCondition.create({
      data: {
        jobId,
        revision: (current?.revision ?? 0) + 1,
        tempStartC: decimal(input.tempStartC),
        tempEndC: decimal(input.tempEndC),
        humidityStart: decimal(input.humidityStart),
        humidityEnd: decimal(input.humidityEnd),
        recordedById: actor.id,
      },
    });
    await audit(tx, {
      entity: "EnvCondition",
      entityId: jobId,
      action: "environment.save",
      actorId: actor.id,
      actorType: "STAFF",
      reason: input.reason,
    });
  });
}

export async function submitVerification(
  actor: StaffActor,
  jobId: string,
  input: { rows: { analysisId: string; completed: boolean; reported: boolean }[]; notes?: string },
) {
  assertCan(actor.role, "verification.submit");
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { analyses: { include: { result: true } }, verification: true },
  });
  if (!job) throw new DomainError("Work order not found.", "NOT_FOUND");
  if (!["CREATED", "IN_ANALYSIS", "RESULTS_ENTERED"].includes(job.status)) {
    throw new DomainError("Results must be entered before verification.");
  }
  if (input.rows.length !== job.analyses.length) {
    throw new DomainError("Complete the verification checklist for every analysis.", "VALIDATION");
  }
  const marked = input.rows.filter((row) => row.completed || row.reported);
  if (marked.length === 0) {
    throw new DomainError("Mark at least one analysis as completed or reported.", "VALIDATION");
  }
  const missing = marked.filter((row) => !job.analyses.find((analysis) => analysis.id === row.analysisId)?.result);
  if (missing.length > 0) {
    throw new DomainError("Enter a result for each analysis marked completed or reported.", "VALIDATION");
  }
  await prisma.$transaction(async (tx) => {
    for (const row of input.rows) {
      await tx.jobAnalysis.update({
        where: { id: row.analysisId },
        data: { completed: row.completed, reported: row.reported },
      });
    }
    if (job.verification) {
      await tx.verification.update({
        where: { jobId },
        data: { submittedById: actor.id, submittedAt: new Date(), verifiedById: null, verifiedAt: null, notes: empty(input.notes) },
      });
    } else {
      await tx.verification.create({
        data: { jobId, submittedById: actor.id, notes: empty(input.notes) },
      });
    }
    await tx.result.updateMany({
      where: { jobAnalysisId: { in: job.analyses.map((analysis) => analysis.id) } },
      data: { lockedAt: new Date() },
    });
    await tx.job.update({ where: { id: jobId }, data: { status: "AWAITING_VERIFICATION" } });
    await audit(tx, {
      entity: "Verification",
      entityId: jobId,
      action: "verification.submit",
      actorId: actor.id,
      actorType: "STAFF",
    });
  });
}

export async function decideVerification(
  actor: StaffActor,
  jobId: string,
  decision: "VERIFIED" | "RETURNED",
  reason?: string,
) {
  assertCan(actor.role, "verification.verify");
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { analyses: { include: { result: true } }, verification: true },
  });
  if (!job?.verification) throw new DomainError("Verification has not been submitted.", "NOT_FOUND");
  if (job.status !== "AWAITING_VERIFICATION") throw new DomainError("This work order is not awaiting verification.");
  if (decision === "RETURNED" && !reason?.trim()) throw new DomainError("Record the reason.", "VALIDATION");
  if (decision === "VERIFIED") {
    if (actor.id === job.verification.submittedById) {
      throw new DomainError("The person who submitted the checklist cannot verify it.");
    }
    const enterers = new Set(job.analyses.map((analysis) => analysis.result?.enteredById).filter(Boolean));
    if (enterers.has(actor.id)) {
      throw new DomainError("The person who entered the results cannot verify them.");
    }
  }
  await prisma.$transaction(async (tx) => {
    if (decision === "VERIFIED") {
      await tx.verification.update({
        where: { jobId },
        data: { verifiedById: actor.id, verifiedAt: new Date() },
      });
      await tx.job.update({ where: { id: jobId }, data: { status: "VERIFIED", dateCompleted: new Date() } });
    } else {
      await tx.job.update({ where: { id: jobId }, data: { status: "IN_ANALYSIS" } });
      await tx.verification.update({
        where: { jobId },
        data: { notes: reason?.trim() },
      });
    }
    await audit(tx, {
      entity: "Verification",
      entityId: jobId,
      action: decision === "VERIFIED" ? "verification.verify" : "verification.return",
      actorId: actor.id,
      actorType: "STAFF",
      reason,
    });
  });
}

function requiredServiceClass(origin: string, requested: ServiceClass): ServiceClass {
  if (origin === "CLIENT_REQUEST" && requested !== "TECHNICAL_SERVICES") {
    throw new DomainError("A client-submitted sample is technical services work.");
  }
  if (origin !== "CLIENT_REQUEST" && requested !== "CONFORMITY_ASSESSMENT") {
    throw new DomainError("Inspector-drawn samples are conformity assessment work.");
  }
  return requested;
}

function assertJobEditable(status: string) {
  if (status === "REPORT_ISSUED" || status === "CANCELLED" || status === "AWAITING_VERIFICATION" || status === "VERIFIED") {
    throw new DomainError("Results are locked for this work order.");
  }
}

async function loadAnalysis(analysisId: string) {
  const analysis = await prisma.jobAnalysis.findUnique({
    where: { id: analysisId },
    include: { job: true, result: true },
  });
  if (!analysis) throw new DomainError("Analysis not found.", "NOT_FOUND");
  return analysis;
}

function day(value?: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new DomainError("Enter a valid date.", "VALIDATION");
  return new Date(`${value}T00:00:00.000Z`);
}

function decimal(value?: string | null) {
  if (!value?.trim()) return null;
  const number = Number(value);
  if (Number.isNaN(number)) throw new DomainError("Enter a number.", "VALIDATION");
  return number;
}

function empty(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const jobInclude = {
  sample: { include: { request: true } },
  analyses: { include: { result: true, readings: { where: { supersededAt: null }, orderBy: { testNo: "asc" } }, revisions: true }, orderBy: { sortOrder: "asc" } },
  envConditions: { where: { supersededAt: null }, orderBy: { revision: "desc" }, take: 1 },
  verification: true,
  reports: { orderBy: { revision: "desc" } },
} satisfies Prisma.JobInclude;
