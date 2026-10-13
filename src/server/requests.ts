import type { LabCode, Prisma, RequestStatus, ServiceType } from "@prisma/client";
import { audit } from "./audit";
import { DomainError } from "./errors";
import { notify } from "./notify";
import { prisma, type Tx } from "./prisma";
import { assertCan } from "./permissions";
import { nextSequence, requestReference } from "./sequences";
import type { StaffActor } from "./accounts";

export type SampleDraft = {
  description: string;
  brandName?: string;
  sizeQuantity?: string;
  manufacturer?: string;
  lotNo?: string;
  bestBefore?: string;
  collectionPoint?: string;
  receiptNo?: string;
  comments?: string;
  collectorSignature?: string;
};

export type RequestDraft = {
  clientName: string;
  clientAddress?: string;
  contactPerson?: string;
  contactNo?: string;
  contactEmail?: string;
  serviceType?: ServiceType | "";
  serviceTypeOther?: string;
  description?: string;
  decisionRuleAck?: boolean;
  signatureName?: string;
  samples: SampleDraft[];
};

const CLIENT_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: [],
  RETURNED: ["SUBMITTED"],
  REJECTED: [],
  ACKNOWLEDGED: [],
  COMPLETED: [],
  CANCELLED: [],
};

const STAFF_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  DRAFT: [],
  SUBMITTED: ["ACKNOWLEDGED", "RETURNED", "REJECTED"],
  RETURNED: [],
  REJECTED: [],
  ACKNOWLEDGED: ["CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export async function saveRequestDraft(accountId: string, userId: string, requestId: string | null, draft: RequestDraft) {
  const data = draftData(draft);
  if (requestId) {
    const existing = await ownedRequest(accountId, requestId);
    if (existing.status !== "DRAFT" && existing.status !== "RETURNED") {
      throw new DomainError("This request can no longer be edited.");
    }
    return prisma.serviceRequest.update({
      where: { id: existing.id },
      data: { ...data, samples: { deleteMany: {}, create: sampleCreates(accountId, draft.samples) } },
    });
  }
  const year = new Date().getUTCFullYear();
  return prisma.$transaction(async (tx) => {
    const sequence = await nextSequence(tx, `request:${year}`);
    return tx.serviceRequest.create({
      data: {
        reference: requestReference(year, sequence),
        accountId,
        submittedById: userId,
        status: "DRAFT",
        ...data,
        samples: { create: sampleCreates(accountId, draft.samples) },
      },
    });
  });
}

export async function submitRequest(accountId: string, userId: string, requestId: string, draft: RequestDraft) {
  validateSubmission(draft);
  const existing = await ownedRequest(accountId, requestId);
  if (!CLIENT_TRANSITIONS[existing.status].includes("SUBMITTED")) {
    throw new DomainError("This request cannot be submitted from its current status.");
  }
  const user = await prisma.clientUser.findUniqueOrThrow({ where: { id: userId } });
  const updated = await prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.update({
      where: { id: existing.id },
      data: {
        ...draftData(draft),
        status: "SUBMITTED",
        submittedAt: new Date(),
        submittedById: userId,
        signedAt: new Date(),
        returnReason: null,
        samples: { deleteMany: {}, create: sampleCreates(accountId, draft.samples) },
      },
    });
    await audit(tx, {
      entity: "ServiceRequest",
      entityId: request.id,
      action: "request.submit",
      actorId: userId,
      actorType: "CLIENT",
      after: { reference: request.reference, status: "SUBMITTED" },
    });
    await notify(tx, {
      clientUserId: userId,
      kind: "REQUEST_SUBMITTED",
      title: "Service request submitted",
      body: `${request.reference} has been submitted to GDBS.`,
      href: `/portal/requests/${request.id}`,
      dedupeKey: `request.submitted:${request.id}:${request.submittedAt?.toISOString() ?? "once"}`,
    });
    return request;
  });
  return { request: updated, email: user.email };
}

export async function verifyRequest(
  actor: StaffActor,
  requestId: string,
  decision: "ACKNOWLEDGED" | "RETURNED" | "REJECTED",
  input: { assignedLab?: LabCode | null; officialComments?: string; reason?: string },
) {
  assertCan(actor.role, "requests.verify");
  const request = await prisma.serviceRequest.findUnique({ where: { id: requestId }, include: { submittedBy: true } });
  if (!request) throw new DomainError("Request not found.", "NOT_FOUND");
  if (!STAFF_TRANSITIONS[request.status].includes(decision)) {
    throw new DomainError("That decision is not available for this request.");
  }
  if ((decision === "RETURNED" || decision === "REJECTED") && !input.reason?.trim()) {
    throw new DomainError("Record the reason.", "VALIDATION");
  }
  if (decision === "ACKNOWLEDGED" && !input.assignedLab) {
    throw new DomainError("Select the laboratory.", "VALIDATION");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.serviceRequest.update({
      where: { id: request.id },
      data: {
        status: decision,
        assignedLab: input.assignedLab ?? request.assignedLab,
        officialComments: empty(input.officialComments),
        responseAt: new Date(),
        returnReason: decision === "RETURNED" ? input.reason?.trim() : null,
        rejectionReason: decision === "REJECTED" ? input.reason?.trim() : null,
      },
    });
    await audit(tx, {
      entity: "ServiceRequest",
      entityId: request.id,
      action: `request.${decision.toLowerCase()}`,
      actorId: actor.id,
      actorType: "STAFF",
      before: { status: request.status },
      after: { status: decision, assignedLab: updated.assignedLab },
      reason: input.reason,
    });
    if (request.submittedById) {
      const copy = {
        ACKNOWLEDGED: ["Request acknowledged", `${request.reference} has been acknowledged by GDBS.`],
        RETURNED: ["Request returned", `${request.reference} was returned: ${input.reason?.trim()}`],
        REJECTED: ["Request rejected", `${request.reference} was rejected: ${input.reason?.trim()}`],
      }[decision];
      await notify(tx, {
        clientUserId: request.submittedById,
        kind: `REQUEST_${decision}`,
        title: copy[0],
        body: copy[1],
        href: `/portal/requests/${request.id}`,
        dedupeKey: `request.${decision}:${request.id}:${updated.responseAt?.toISOString()}`,
      });
    }
    return updated;
  });
}

export async function getRequestForAccount(accountId: string, requestId: string) {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, accountId },
    include: requestInclude,
  });
  if (!request) throw new DomainError("Request not found.", "NOT_FOUND");
  return request;
}

async function ownedRequest(accountId: string, requestId: string) {
  const request = await prisma.serviceRequest.findFirst({ where: { id: requestId, accountId } });
  if (!request) throw new DomainError("Request not found.", "NOT_FOUND");
  return request;
}

function validateSubmission(draft: RequestDraft) {
  if (!draft.clientName.trim()) throw new DomainError("Enter the client name.", "VALIDATION");
  if (!draft.serviceType) throw new DomainError("Select the type of service.", "VALIDATION");
  if (draft.serviceType === "OTHER" && !draft.serviceTypeOther?.trim()) {
    throw new DomainError("Describe the other service.", "VALIDATION");
  }
  if (!draft.decisionRuleAck) throw new DomainError("The Decision Rule acknowledgement is required.", "VALIDATION");
  if (!draft.signatureName?.trim()) throw new DomainError("Enter the client signature name.", "VALIDATION");
  const samples = draft.samples.filter((sample) => sample.description.trim());
  if (samples.length === 0) throw new DomainError("Enter at least one sample description.", "VALIDATION");
}

function draftData(draft: RequestDraft) {
  return {
    clientName: draft.clientName.trim(),
    clientAddress: empty(draft.clientAddress),
    contactPerson: empty(draft.contactPerson),
    contactNo: empty(draft.contactNo),
    contactEmail: empty(draft.contactEmail),
    serviceType: draft.serviceType || null,
    serviceTypeOther: draft.serviceType === "OTHER" ? empty(draft.serviceTypeOther) : null,
    description: empty(draft.description),
    decisionRuleAck: Boolean(draft.decisionRuleAck),
    signatureName: empty(draft.signatureName),
  };
}

function sampleCreates(accountId: string, samples: SampleDraft[]): Prisma.SampleCreateWithoutRequestInput[] {
  return samples
    .filter((sample) => sample.description.trim())
    .map((sample) => ({
      origin: "CLIENT_REQUEST",
      accountId,
      description: sample.description.trim(),
      brandName: empty(sample.brandName),
      sizeQuantity: empty(sample.sizeQuantity),
      manufacturer: empty(sample.manufacturer),
      lotNo: empty(sample.lotNo),
      bestBefore: sample.bestBefore ? new Date(sample.bestBefore) : null,
      collectionPoint: empty(sample.collectionPoint),
      receiptNo: empty(sample.receiptNo),
      comments: empty(sample.comments),
      collectorSignature: empty(sample.collectorSignature),
    }));
}

function empty(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const requestInclude = {
  samples: { include: { jobs: { include: { reports: true, analyses: true } } } },
  quotations: { include: { lines: true }, orderBy: { version: "desc" as const } },
  payments: { orderBy: { createdAt: "desc" as const } },
  documents: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.ServiceRequestInclude;

export async function clientProgress(requestId: string, accountId: string) {
  const request = await getRequestForAccount(accountId, requestId);
  const jobs = request.samples.flatMap((sample) => sample.jobs).filter((job) => job.serviceClass === "TECHNICAL_SERVICES");
  const received = request.samples.some((sample) => sample.receivedAt);
  const testing = jobs.some((job) => ["IN_ANALYSIS", "RESULTS_ENTERED", "CREATED"].includes(job.status));
  const review = jobs.some((job) => ["AWAITING_VERIFICATION", "VERIFIED"].includes(job.status));
  const issued = jobs.some((job) => job.reports.some((report) => report.status === "ISSUED"));
  const steps = [
    { label: "Draft", done: true },
    { label: "Submitted", done: request.status !== "DRAFT" },
    { label: "Acknowledged", done: ["ACKNOWLEDGED", "COMPLETED"].includes(request.status) },
    { label: "Sample received", done: received },
    { label: "Testing in progress", done: testing || review || issued },
    { label: "Technical review", done: review || issued },
    { label: "Report issued", done: issued || request.status === "COMPLETED" },
  ];
  if (request.status === "RETURNED") steps.splice(2, 0, { label: "Returned for correction", done: true });
  if (request.status === "REJECTED") steps.splice(2, 0, { label: "Rejected", done: true });
  return steps;
}

export type { Tx };
