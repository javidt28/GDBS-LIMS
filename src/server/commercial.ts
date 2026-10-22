import type { PaymentMethod, Prisma } from "@prisma/client";
import { audit } from "./audit";
import type { StaffActor } from "./accounts";
import { DomainError } from "./errors";
import { notify } from "./notify";
import { assertCan } from "./permissions";
import { prisma, type Tx } from "./prisma";

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
  if (quotation.lines.length === 0) throw new DomainError("Add at least one approved fee before issuing the invoice.");
  const currencies = new Set(quotation.lines.map((line) => line.currency));
  if (currencies.size !== 1) throw new DomainError("An invoice cannot mix currencies.");
  const terms = await prisma.systemSetting.findUnique({ where: { key: "quotation.acceptanceTerms" } });
  const acceptanceTerms = typeof terms?.value === "string" ? terms.value : "";
  if (!acceptanceTerms.trim()) {
    throw new DomainError("Acceptance terms have not been approved, so this invoice cannot be issued.");
  }
  return prisma.$transaction(async (tx) => markInvoiceIssued(tx, actor, quotation, acceptanceTerms));
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
  if (!quotation || quotation.status !== "ISSUED") throw new DomainError("Invoice not found.", "NOT_FOUND");
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
    if (decision === "ACCEPTED") await ensurePaymentRecord(tx, quotation.requestId);
    const staff = await tx.staffUser.findMany({ where: { role: { in: ["FINANCE", "ADMINISTRATOR"] }, disabledAt: null } });
    for (const person of staff) {
      await notify(tx, {
        staffUserId: person.id,
        kind: decision === "ACCEPTED" ? "QUOTATION_ACCEPTED" : "QUOTATION_REJECTED",
        title: decision === "ACCEPTED" ? "Invoice accepted" : "Invoice rejected",
        body: `${quotation.request.reference} invoice version ${quotation.version} was ${decision === "ACCEPTED" ? "accepted" : "rejected"}.`,
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
  if (!note?.trim()) throw new DomainError("Record the accounts sign-off note.", "VALIDATION");
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { request: true } });
  if (!payment) throw new DomainError("Payment not found.", "NOT_FOUND");
  if (payment.status !== "REFERENCE_SUBMITTED" && payment.status !== "AWAITING") {
    throw new DomainError("This payment cannot be confirmed from its current status.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: actor.id, confirmationNote: note.trim() },
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
  const request = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new DomainError("Request not found.", "NOT_FOUND");
  if (request.status !== "ACKNOWLEDGED" && request.status !== "COMPLETED") {
    throw new DomainError("A payment can be opened only for an acknowledged request.");
  }
  return prisma.$transaction((tx) => ensurePaymentRecord(tx, requestId, method));
}

/** Creates the invoice after a request is acknowledged. Reception can trigger this; finance still edits drafts. */
export async function generateInvoiceOnAcknowledge(tx: Tx, actor: StaffActor, requestId: string) {
  const existing = await tx.quotation.findFirst({ where: { requestId }, orderBy: { version: "desc" } });
  if (existing) {
    if (existing.status === "ISSUED" || existing.status === "ACCEPTED") await ensurePaymentRecord(tx, requestId);
    return existing;
  }
  const request = await tx.serviceRequest.findUnique({
    where: { id: requestId },
    include: { samples: true },
  });
  if (!request) throw new DomainError("Request not found.", "NOT_FOUND");
  const quotation = await tx.quotation.create({ data: { requestId, version: 1, status: "DRAFT" } });
  await audit(tx, {
    entity: "Quotation",
    entityId: quotation.id,
    action: "quotation.create",
    actorId: actor.id,
    actorType: "STAFF",
    after: { version: 1, source: "acknowledge" },
  });
  const fees = await activeFees(tx);
  const matched = feesForRequest(fees, request);
  const quantity = Math.max(request.samples.length, 1);
  for (const fee of matched) {
    await tx.quotationLine.create({
      data: {
        quotationId: quotation.id,
        feeScheduleId: fee.id,
        description: fee.name,
        quantity,
        unitAmount: fee.amount,
        amount: Number(fee.amount) * quantity,
        currency: fee.currency,
      },
    });
  }
  const withLines = await tx.quotation.findUniqueOrThrow({
    where: { id: quotation.id },
    include: { lines: true, request: true },
  });
  const terms = await tx.systemSetting.findUnique({ where: { key: "quotation.acceptanceTerms" } });
  const acceptanceTerms = typeof terms?.value === "string" ? terms.value : "";
  const currencies = new Set(withLines.lines.map((line) => line.currency));
  if (withLines.lines.length === 0 || !acceptanceTerms.trim() || currencies.size !== 1) {
    const finance = await tx.staffUser.findMany({ where: { role: { in: ["FINANCE", "ADMINISTRATOR"] }, disabledAt: null } });
    for (const person of finance) {
      await notify(tx, {
        staffUserId: person.id,
        kind: "INVOICE_DRAFT",
        title: "Invoice needs pricing",
        body: `${request.reference} was acknowledged. Add approved fees and issue the invoice.`,
        href: `/internal/quotations/${quotation.id}`,
        dedupeKey: `invoice.draft:${quotation.id}:${person.id}`,
      });
    }
    return withLines;
  }
  return markInvoiceIssued(tx, actor, withLines, acceptanceTerms);
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

type InvoiceRecord = Prisma.QuotationGetPayload<{ include: { lines: true; request: true } }>;

async function markInvoiceIssued(tx: Tx, actor: StaffActor, quotation: InvoiceRecord, acceptanceTerms: string) {
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
  await ensurePaymentRecord(tx, quotation.requestId);
  if (quotation.request.submittedById) {
    await notify(tx, {
      clientUserId: quotation.request.submittedById,
      kind: "QUOTATION_ISSUED",
      title: "Invoice issued",
      body: `Invoice version ${quotation.version} for ${quotation.request.reference} is ready. You can accept it or pay before accepting.`,
      href: `/portal/requests/${quotation.requestId}?tab=invoice`,
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
}

async function invoiceAmount(tx: Tx, requestId: string) {
  const quotation = await tx.quotation.findFirst({
    where: { requestId, status: { in: ["ISSUED", "ACCEPTED"] } },
    include: { lines: true },
    orderBy: { version: "desc" },
  });
  if (!quotation || quotation.lines.length === 0) return { amount: null as number | null, currency: null as string | null };
  return {
    amount: quotation.lines.reduce((sum, line) => sum + Number(line.amount), 0),
    currency: quotation.currency ?? quotation.lines[0].currency,
  };
}

async function ensurePaymentRecord(tx: Tx, requestId: string, method: PaymentMethod = "DIRECT_DEPOSIT") {
  const priced = await invoiceAmount(tx, requestId);
  const existing = await tx.payment.findFirst({ where: { requestId }, orderBy: { createdAt: "desc" } });
  if (existing) {
    if ((existing.status === "AWAITING" || existing.status === "UNPRICED") && priced.amount != null) {
      return tx.payment.update({
        where: { id: existing.id },
        data: { status: "AWAITING", amount: priced.amount, currency: priced.currency, method: existing.method ?? method },
      });
    }
    return existing;
  }
  return tx.payment.create({
    data: {
      requestId,
      method,
      status: priced.amount == null ? "UNPRICED" : "AWAITING",
      amount: priced.amount,
      currency: priced.currency,
    },
  });
}

async function activeFees(tx: Tx) {
  const now = new Date();
  return tx.feeSchedule.findMany({
    where: { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
    orderBy: { name: "asc" },
  });
}

function feesForRequest<T extends { name: string }>(fees: T[], request: { description: string | null; serviceType: string | null }) {
  const haystack = `${request.description ?? ""} ${request.serviceType ?? ""}`.toLowerCase();
  return fees.filter((fee) => {
    const label = fee.name.replace(/^demo\s*[–-]\s*/i, "").toLowerCase();
    const token = label.replace(/\b(content|panel|analysis|test|testing|check|for|and)\b/g, " ").trim().split(/\s+/)[0];
    return Boolean(token && token.length >= 3 && haystack.includes(token));
  });
}

export type CommercialLine = Prisma.QuotationLineGetPayload<{ include: { feeSchedule: true } }>;
