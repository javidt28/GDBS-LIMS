import type { PaymentMethod, Prisma } from "@prisma/client";
import { audit } from "./audit";
import type { StaffActor } from "./accounts";
import { DomainError } from "./errors";
import { notify } from "./notify";
import { assertCan } from "./permissions";
import { prisma } from "./prisma";

export async function createQuotation(actor: StaffActor, requestId: string) {
  assertCan(actor.role, "quotations.manage");
  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { quotations: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!request) throw new DomainError("Request not found.", "NOT_FOUND");
  const version = (request.quotations[0]?.version ?? 0) + 1;
  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.create({ data: { requestId, version, status: "DRAFT" } });
    await audit(tx, {
      entity: "Quotation",
      entityId: quotation.id,
      action: "quotation.create",
      actorId: actor.id,
      actorType: "STAFF",
      after: { version },
    });
    return quotation;
  });
}

export async function addQuotationLine(
  actor: StaffActor,
  quotationId: string,
  input: { feeScheduleId: string; quantity: number },
) {
  assertCan(actor.role, "quotations.manage");
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new DomainError("Enter a quantity of at least 1.", "VALIDATION");
  }
  const quotation = await prisma.quotation.findUnique({ where: { id: quotationId } });
  if (!quotation || quotation.status !== "DRAFT") throw new DomainError("Only a draft quotation can be changed.");
  const fee = await prisma.feeSchedule.findUnique({ where: { id: input.feeScheduleId } });
  if (!fee || (fee.effectiveTo && fee.effectiveTo < new Date()) || fee.effectiveFrom > new Date()) {
    throw new DomainError("Select an approved fee. No rate can be typed in.", "VALIDATION");
  }
  const amount = Number(fee.amount) * input.quantity;
  return prisma.quotationLine.create({
    data: {
      quotationId,
      feeScheduleId: fee.id,
      description: fee.name,
      quantity: input.quantity,
      unitAmount: fee.amount,
      amount,
      currency: fee.currency,
    },
  });
}

export async function issueQuotation(actor: StaffActor, quotationId: string) {
  assertCan(actor.role, "quotations.manage");
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { lines: true, request: true },
  });
  if (!quotation) throw new DomainError("Quotation not found.", "NOT_FOUND");
  if (quotation.lines.length === 0) throw new DomainError("Add at least one approved fee before issuing.");
  const currencies = new Set(quotation.lines.map((line) => line.currency));
  if (currencies.size !== 1) throw new DomainError("A quotation cannot mix currencies.");
  const terms = await prisma.systemSetting.findUnique({ where: { key: "quotation.acceptanceTerms" } });
  const acceptanceTerms = typeof terms?.value === "string" ? terms.value : "";
  if (!acceptanceTerms.trim()) {
    throw new DomainError("Acceptance terms have not been approved, so this quotation cannot be issued.");
  }
  return prisma.$transaction(async (tx) => {
    const issued = await tx.quotation.update({
      where: { id: quotation.id },
      data: {
        status: "ISSUED",
        issuedAt: new Date(),
        issuedById: actor.id,
        currency: quotation.lines[0].currency,
        acceptanceTerms,
      },
    });
    if (quotation.request.submittedById) {
      await notify(tx, {
        clientUserId: quotation.request.submittedById,
        kind: "QUOTATION_ISSUED",
        title: "Quotation issued",
        body: `Version ${quotation.version} for ${quotation.request.reference} is ready for review.`,
        href: `/portal/requests/${quotation.requestId}`,
        dedupeKey: `quotation.issued:${quotation.id}`,
      });
    }
    await audit(tx, {
      entity: "Quotation",
      entityId: quotation.id,
      action: "quotation.issue",
      actorId: actor.id,
      actorType: "STAFF",
    });
    return issued;
  });
}

export async function decideQuotation(
  clientUserId: string,
  accountId: string,
  quotationId: string,
  decision: "ACCEPTED" | "REJECTED",
  reason?: string,
) {
  const quotation = await prisma.quotation.findFirst({
    where: { id: quotationId, request: { accountId } },
    include: { request: true },
  });
  if (!quotation || quotation.status !== "ISSUED") throw new DomainError("Quotation not found.", "NOT_FOUND");
  if (decision === "REJECTED" && !reason?.trim()) throw new DomainError("Record the reason for rejection.", "VALIDATION");
  if (decision === "ACCEPTED" && !quotation.acceptanceTerms?.trim()) {
    throw new DomainError("Acceptance terms have not been approved.", "VALIDATION");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.quotation.update({
      where: { id: quotation.id },
      data:
        decision === "ACCEPTED"
          ? { status: "ACCEPTED", acceptedAt: new Date(), acceptedById: clientUserId }
          : { status: "REJECTED", rejectedAt: new Date(), acceptedById: clientUserId, rejectionReason: reason?.trim() },
    });
    await audit(tx, {
      entity: "Quotation",
      entityId: quotation.id,
      action: decision === "ACCEPTED" ? "quotation.accept" : "quotation.reject",
      actorId: clientUserId,
      actorType: "CLIENT",
      after: { version: quotation.version, terms: quotation.acceptanceTerms },
      reason,
    });
    const staff = await tx.staffUser.findMany({ where: { role: { in: ["FINANCE", "ADMINISTRATOR"] }, disabledAt: null } });
    for (const person of staff) {
      await notify(tx, {
        staffUserId: person.id,
        kind: decision === "ACCEPTED" ? "QUOTATION_ACCEPTED" : "QUOTATION_REJECTED",
        title: decision === "ACCEPTED" ? "Quotation accepted" : "Quotation rejected",
        body: `${quotation.request.reference} version ${quotation.version} was ${decision === "ACCEPTED" ? "accepted" : "rejected"}.`,
        href: `/internal/quotations/${quotation.id}`,
        dedupeKey: `quotation.${decision}:${quotation.id}:${person.id}`,
      });
    }
    return updated;
  });
}

export async function createFee(
  actor: StaffActor,
  input: { code: string; name: string; unit: string; amount: string; currency: string; effectiveFrom: string; notes?: string },
) {
  if (actor.role !== "ADMINISTRATOR") throw new DomainError("Only an administrator can approve a fee.", "FORBIDDEN");
  if (!input.currency.trim()) throw new DomainError("Enter the currency code supplied by GDBS.", "VALIDATION");
  const amount = Number(input.amount);
  if (!(amount >= 0)) throw new DomainError("Enter the approved amount.", "VALIDATION");
  return prisma.$transaction(async (tx) => {
    const fee = await tx.feeSchedule.create({
      data: {
        code: input.code.trim(),
        name: input.name.trim(),
        unit: input.unit.trim(),
        amount,
        currency: input.currency.trim().toUpperCase(),
        effectiveFrom: new Date(input.effectiveFrom),
        approvedById: actor.id,
        notes: input.notes?.trim() || null,
      },
    });
    await audit(tx, {
      entity: "FeeSchedule",
      entityId: fee.id,
      action: "fee.create",
      actorId: actor.id,
      actorType: "STAFF",
      after: { code: fee.code, amount: input.amount, currency: fee.currency },
    });
    return fee;
  });
}

export async function recordPaymentReference(accountId: string, userId: string, paymentId: string, reference: string) {
  if (!reference.trim()) throw new DomainError("Enter the payment reference.", "VALIDATION");
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, request: { accountId } } });
  if (!payment) throw new DomainError("Payment not found.", "NOT_FOUND");
  if (payment.status === "CONFIRMED" || payment.status === "WAIVED") {
    throw new DomainError("This payment has already been settled.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: "REFERENCE_SUBMITTED", clientReference: reference.trim(), referenceSubmittedAt: new Date() },
    });
    await audit(tx, {
      entity: "Payment",
      entityId: payment.id,
      action: "payment.reference_submitted",
      actorId: userId,
      actorType: "CLIENT",
      after: { status: "REFERENCE_SUBMITTED" },
    });
    return updated;
  });
}

export async function confirmPayment(actor: StaffActor, paymentId: string, note?: string) {
  assertCan(actor.role, "payments.confirm");
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { request: true } });
  if (!payment) throw new DomainError("Payment not found.", "NOT_FOUND");
  if (payment.status !== "REFERENCE_SUBMITTED" && payment.status !== "AWAITING") {
    throw new DomainError("This payment cannot be confirmed from its current status.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: actor.id, confirmationNote: note?.trim() || null },
    });
    await audit(tx, {
      entity: "Payment",
      entityId: payment.id,
      action: "payment.confirm",
      actorId: actor.id,
      actorType: "STAFF",
    });
    if (payment.request.submittedById) {
      await notify(tx, {
        clientUserId: payment.request.submittedById,
        kind: "PAYMENT_CONFIRMED",
        title: "Payment confirmed",
        body: `Payment for ${payment.request.reference} was confirmed by GDBS.`,
        href: `/portal/requests/${payment.requestId}`,
        dedupeKey: `payment.confirmed:${payment.id}`,
      });
    }
    return updated;
  });
}

export async function openPayment(actor: StaffActor, requestId: string, method: PaymentMethod) {
  assertCan(actor.role, "payments.confirm");
  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { quotations: { where: { status: "ACCEPTED" }, orderBy: { version: "desc" }, take: 1, include: { lines: true } } },
  });
  if (!request) throw new DomainError("Request not found.", "NOT_FOUND");
  if (request.status !== "ACKNOWLEDGED" && request.status !== "COMPLETED") {
    throw new DomainError("A payment can be opened only for an acknowledged request.");
  }
  if (await prisma.payment.count({ where: { requestId } })) {
    throw new DomainError("This request already has a payment record.");
  }
  const accepted = request.quotations[0];
  const amount = accepted ? accepted.lines.reduce((sum, line) => sum + Number(line.amount), 0) : null;
  return prisma.payment.create({
    data: {
      requestId,
      method,
      status: amount == null ? "UNPRICED" : "AWAITING",
      amount,
      currency: accepted?.currency,
    },
  });
}

export async function setAcceptanceTerms(actor: StaffActor, terms: string) {
  if (actor.role !== "ADMINISTRATOR") throw new DomainError("Only an administrator can set acceptance terms.", "FORBIDDEN");
  if (!terms.trim()) throw new DomainError("Enter the approved acceptance terms.", "VALIDATION");
  await prisma.systemSetting.upsert({
    where: { key: "quotation.acceptanceTerms" },
    create: { key: "quotation.acceptanceTerms", value: terms.trim() },
    update: { value: terms.trim() },
  });
  await audit(prisma, {
    entity: "SystemSetting",
    entityId: "quotation.acceptanceTerms",
    action: "settings.acceptance_terms",
    actorId: actor.id,
    actorType: "STAFF",
  });
}

export type CommercialLine = Prisma.QuotationLineGetPayload<{ include: { feeSchedule: true } }>;
