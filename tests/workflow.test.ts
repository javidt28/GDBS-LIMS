import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/crypto";
import { addQuotationLine, confirmPayment, createFee, createQuotation, decideQuotation, issueQuotation, recordPaymentReference, setAcceptanceTerms } from "@/server/commercial";
import { DomainError } from "@/server/errors";
import { createJob, receiveSample, saveResult, submitVerification, decideVerification } from "@/server/laboratory";
import { prisma } from "@/server/prisma";
import { issueReport, openReportCorrection, readIssuedReport } from "@/server/reports";
import { getRequestForAccount, saveRequestDraft, submitRequest, verifyRequest } from "@/server/requests";
import { registerClient, verifyEmail } from "@/server/accounts";
import type { StaffActor } from "@/server/accounts";
import { readPrivateBytes } from "@/server/storage";

async function reset() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog", "Notification", "Document", "Payment", "QuotationLine", "Quotation",
      "FeeSchedule", "Report", "Verification", "EnvCondition", "ResultRevision", "Result",
      "RawReading", "JobAnalysis", "Job", "Sample", "ServiceRequest", "EmailToken",
      "Session", "ClientUser", "StaffUser", "ClientAccount", "NumberSequence", "SystemSetting"
    RESTART IDENTITY CASCADE
  `);
}

async function makeStaff(role: StaffActor["role"], name: string): Promise<StaffActor> {
  const row = await prisma.staffUser.create({
    data: {
      email: `${name}@gdbs.test`,
      fullName: name,
      passwordHash: await hashPassword("long-password-1"),
      role,
    },
  });
  return { id: row.id, role: row.role, lab: row.lab, fullName: row.fullName };
}

async function makeClient(email: string) {
  const created = await registerClient({ email, password: "long-password-1", fullName: "Ada Client" });
  await verifyEmail(created.verifyToken);
  const user = await prisma.clientUser.findUniqueOrThrow({ where: { id: created.userId }, include: { account: true } });
  await prisma.clientAccount.update({
    where: { id: user.accountId },
    data: { name: "Ada Client", profileCompletedAt: new Date(), address: "St. George's" },
  });
  return user;
}

afterEach(async () => {
  await reset();
});

describe("sample testing path", () => {
  it("issues a report and keeps a superseded original", async () => {
    const client = await makeClient("ada@example.com");
    const other = await makeClient("bea@example.com");
    const reception = await makeStaff("RECEPTION", "Reception");
    const analyst = await makeStaff("ANALYST", "Analyst");
    const approver = await makeStaff("APPROVER", "Approver");
    const clerk = await makeStaff("ADMINISTRATOR", "Clerk");

    const draft = await saveRequestDraft(client.accountId, client.id, null, {
      clientName: "Ada Client",
      clientAddress: "St. George's",
      contactEmail: client.email,
      serviceType: "TESTING",
      description: "Flour sample",
      decisionRuleAck: true,
      signatureName: "Ada Client",
      samples: [{ description: "Wheat flour", brandName: "Local", lotNo: "L1" }],
    });
    const submitted = await submitRequest(client.accountId, client.id, draft.id, {
      clientName: "Ada Client",
      serviceType: "TESTING",
      description: "Flour sample",
      decisionRuleAck: true,
      signatureName: "Ada Client",
      samples: [{ description: "Wheat flour", brandName: "Local", lotNo: "L1" }],
    });
    await verifyRequestSafe(reception, submitted.request.id);
    const sample = await prisma.sample.findFirstOrThrow({ where: { requestId: submitted.request.id } });
    await receiveSample(reception, sample.id, { analysisBasis: "STANDARD_COMPLIANCE" });
    const job = await createJob(reception, {
      sampleId: sample.id,
      lab: "AL",
      jobDate: "2026-01-05",
      serviceClass: "TECHNICAL_SERVICES",
      analysisNames: ["Moisture Content (%)", "Protein (%)"],
      procedures: "As recorded by the analyst",
      placeOfAnalysis: "GDBS Analytical Laboratory",
    });
    expect(job.jobNo).toBe("20260105AL01");
    const second = await createJob(reception, {
      sampleId: (await prisma.sample.create({
        data: {
          origin: "CLIENT_REQUEST",
          accountId: client.accountId,
          requestId: submitted.request.id,
          description: "Second pack",
          receivedAt: new Date(),
          analysisBasis: "QUALITY_CONTROL",
          receivedById: reception.id,
        },
      })).id,
      lab: "AL",
      jobDate: "2026-01-05",
      serviceClass: "TECHNICAL_SERVICES",
      analysisNames: ["pH"],
    });
    expect(second.jobNo).toBe("20260105AL02");

    const analyses = await prisma.jobAnalysis.findMany({ where: { jobId: job.id }, orderBy: { sortOrder: "asc" } });
    for (const analysis of analyses) {
      await saveResult(analyst, analysis.id, { actualValue: analysis.name.startsWith("Moisture") ? "12.1" : "8.0" });
    }
    await submitVerification(analyst, job.id, {
      rows: analyses.map((analysis) => ({ analysisId: analysis.id, completed: true, reported: true })),
    });
    await expect(saveResult(analyst, analyses[0].id, { actualValue: "99" })).rejects.toThrow(/locked/);
    await decideVerification(approver, job.id, "RETURNED", "Check the moisture result");
    await expect(saveResult(analyst, analyses[0].id, { actualValue: "99" })).rejects.toThrow(/reason/);
    await saveResult(analyst, analyses[0].id, { actualValue: "12.1", reason: "Original entry confirmed" });
    await submitVerification(clerk, job.id, {
      rows: analyses.map((analysis) => ({ analysisId: analysis.id, completed: true, reported: true })),
    });
    await expect(decideVerification(clerk, job.id, "VERIFIED")).rejects.toThrow(/cannot verify/);
    await decideVerification(approver, job.id, "VERIFIED");
    const issued = await issueReport(approver, job.id, "CERTIFICATE_OF_ANALYSIS");
    const originalBytes = await readPrivateBytes(issued.storageKey);
    const originalHash = createHash("sha256").update(originalBytes).digest("hex");
    expect(originalHash).toBe(issued.sha256);
    expect(issued.certificateNo).toMatch(/^2026AL\d+$/);
    expect(originalBytes.subarray(0, 5).toString()).toBe("%PDF-");
    const content = issued.content as { rows: { analysis: string; requirement: string; actual: string; comments: string }[]; standard: string; formNo: string };
    expect(content.formNo).toBe("GDBS-QMF-043");
    expect(content.standard).toBe("GDS 12: 1992 - Specification for Wheat Flour");
    expect(content.rows).toEqual([
      expect.objectContaining({ analysis: "Moisture Content", requirement: "15% (max)", actual: "12.1", comments: "Pass" }),
      expect.objectContaining({ analysis: "Protein", requirement: "7% (min)", actual: "8.0", comments: "Pass" }),
    ]);

    await expect(getRequestForAccount(other.accountId, submitted.request.id)).rejects.toBeInstanceOf(DomainError);
    const own = await readIssuedReport(issued.id, client.accountId);
    expect(own.bytes.equals(originalBytes)).toBe(true);
    await expect(readIssuedReport(issued.id, other.accountId)).rejects.toBeInstanceOf(DomainError);

    await openReportCorrection(approver, issued.id, "Transcription correction");
    await saveResult(analyst, analyses[0].id, { actualValue: "12.4", reason: "Recalculated average" });
    await submitVerification(analyst, job.id, {
      rows: analyses.map((analysis) => ({ analysisId: analysis.id, completed: true, reported: true })),
    });
    await decideVerification(approver, job.id, "VERIFIED");
    const revised = await issueReport(approver, job.id, "CERTIFICATE_OF_ANALYSIS");
    const stillThere = await readPrivateBytes(issued.storageKey);
    expect(createHash("sha256").update(stillThere).digest("hex")).toBe(originalHash);
    expect(revised.certificateNo).not.toBe(issued.certificateNo);
    const old = await prisma.report.findUniqueOrThrow({ where: { id: issued.id } });
    expect(old.status).toBe("SUPERSEDED");
    expect(revised.revision).toBe(2);
  });

  it("submits verification for completed analyses without waiting for the rest", async () => {
    const client = await makeClient("eva@example.com");
    const reception = await makeStaff("RECEPTION", "Desk");
    const analyst = await makeStaff("ANALYST", "Chemist");
    const draft = await saveRequestDraft(client.accountId, client.id, null, {
      clientName: "Eva Client",
      serviceType: "TESTING",
      decisionRuleAck: true,
      signatureName: "Eva Client",
      samples: [{ description: "Wheat flour" }],
    });
    const submitted = await submitRequest(client.accountId, client.id, draft.id, {
      clientName: "Eva Client",
      serviceType: "TESTING",
      decisionRuleAck: true,
      signatureName: "Eva Client",
      samples: [{ description: "Wheat flour" }],
    });
    await verifyRequestSafe(reception, submitted.request.id);
    const sample = await prisma.sample.findFirstOrThrow({ where: { requestId: submitted.request.id } });
    await receiveSample(reception, sample.id, { analysisBasis: "STANDARD_COMPLIANCE" });
    const job = await createJob(reception, {
      sampleId: sample.id,
      lab: "AL",
      jobDate: "2026-03-01",
      serviceClass: "TECHNICAL_SERVICES",
      analysisNames: ["Moisture Content (%)", "Protein (%)"],
    });
    const analyses = await prisma.jobAnalysis.findMany({ where: { jobId: job.id }, orderBy: { sortOrder: "asc" } });
    await saveResult(analyst, analyses[0].id, { actualValue: "13.2" });
    await expect(
      submitVerification(
        analyst,
        job.id,
        { rows: analyses.map((analysis) => ({ analysisId: analysis.id, completed: true, reported: true })) },
      ),
    ).rejects.toThrow(/Enter a result for each analysis marked completed or reported/);
    await submitVerification(analyst, job.id, {
      rows: analyses.map((analysis) => ({
        analysisId: analysis.id,
        completed: analysis.id === analyses[0].id,
        reported: analysis.id === analyses[0].id,
      })),
    });
    const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("AWAITING_VERIFICATION");
  });

  it("hides conformity assessment work from the client portal", async () => {
    const client = await makeClient("cara@example.com");
    const reception = await makeStaff("RECEPTION", "Gate");
    const sample = await prisma.sample.create({
      data: {
        origin: "INSPECTION",
        description: "Inspector sample",
        receivedAt: new Date(),
        analysisBasis: "STANDARD_COMPLIANCE",
      },
    });
    await createJob(reception, {
      sampleId: sample.id,
      lab: "MBL",
      jobDate: "2026-02-02",
      serviceClass: "CONFORMITY_ASSESSMENT",
      analysisNames: ["pH"],
    });
    await expect(
      createJob(reception, {
        sampleId: sample.id,
        lab: "MBL",
        jobDate: "2026-02-03",
        serviceClass: "TECHNICAL_SERVICES",
        analysisNames: ["pH"],
      }),
    ).rejects.toThrow(/conformity/);
    const visible = await prisma.sample.count({ where: { accountId: client.accountId, origin: "CLIENT_REQUEST" } });
    expect(visible).toBe(0);
  });
});

describe("quotations", () => {
  it("rejects a quotation and refuses a line without an approved fee", async () => {
    const client = await makeClient("dara@example.com");
    const finance = await makeStaff("FINANCE", "Finance");
    const admin = await makeStaff("ADMINISTRATOR", "Admin");
    const draft = await saveRequestDraft(client.accountId, client.id, null, {
      clientName: "Dara",
      serviceType: "TESTING",
      decisionRuleAck: true,
      signatureName: "Dara",
      samples: [{ description: "Water" }],
    });
    await submitRequest(client.accountId, client.id, draft.id, {
      clientName: "Dara",
      serviceType: "TESTING",
      decisionRuleAck: true,
      signatureName: "Dara",
      samples: [{ description: "Water" }],
    });
    const quotation = await createQuotation(finance, draft.id);
    await expect(addQuotationLine(finance, quotation.id, { feeScheduleId: "missing", quantity: 1 })).rejects.toThrow(/approved fee/);
    const fee = await createFee(admin, {
      code: "TEST-ONLY",
      name: "Test fee",
      unit: "per sample",
      amount: "10.00",
      currency: "XCD",
      effectiveFrom: "2026-01-01",
    });
    await addQuotationLine(finance, quotation.id, { feeScheduleId: fee.id, quantity: 2 });
    await expect(issueQuotation(finance, quotation.id)).rejects.toThrow(/Acceptance terms/);
    await setAcceptanceTerms(admin, "I accept this quotation version.");
    await issueQuotation(finance, quotation.id);
    const rejected = await decideQuotation(client.id, client.accountId, quotation.id, "REJECTED", "Price not agreed");
    expect(rejected.status).toBe("REJECTED");
    const audit = await prisma.auditLog.findFirst({ where: { entityId: quotation.id, action: "quotation.reject" } });
    expect(audit?.reason).toBe("Price not agreed");
  });

  it("issues an invoice on acknowledge and lets the client pay before accepting", async () => {
    const client = await makeClient("ina@example.com");
    const reception = await makeStaff("RECEPTION", "InaDesk");
    const finance = await makeStaff("FINANCE", "InaAccounts");
    const admin = await makeStaff("ADMINISTRATOR", "InaAdmin");
    await createFee(admin, {
      code: "MOIST-INVOICE",
      name: "Moisture content",
      unit: "per sample",
      amount: "55.00",
      currency: "XCD",
      effectiveFrom: "2026-01-01",
    });
    await setAcceptanceTerms(admin, "I accept this invoice.");
    const draft = await saveRequestDraft(client.accountId, client.id, null, {
      clientName: "Ina Client",
      serviceType: "TESTING",
      description: "Moisture check on flour",
      decisionRuleAck: true,
      signatureName: "Ina Client",
      samples: [{ description: "Wheat flour" }],
    });
    const submitted = await submitRequest(client.accountId, client.id, draft.id, {
      clientName: "Ina Client",
      serviceType: "TESTING",
      description: "Moisture check on flour",
      decisionRuleAck: true,
      signatureName: "Ina Client",
      samples: [{ description: "Wheat flour" }],
    });
    await verifyRequest(reception, submitted.request.id, "ACKNOWLEDGED", { assignedLab: "AL" });
    const invoice = await prisma.quotation.findFirstOrThrow({
      where: { requestId: submitted.request.id },
      include: { lines: true },
    });
    expect(invoice.status).toBe("ISSUED");
    expect(invoice.lines).toHaveLength(1);
    const payment = await prisma.payment.findFirstOrThrow({ where: { requestId: submitted.request.id } });
    expect(payment.status).toBe("AWAITING");
    expect(Number(payment.amount)).toBe(55);
    await recordPaymentReference(client.accountId, client.id, payment.id, "DEP-BEFORE-ACCEPT");
    await decideQuotation(client.id, client.accountId, invoice.id, "ACCEPTED");
    await expect(confirmPayment(finance, payment.id, "")).rejects.toThrow(/sign-off/);
    await confirmPayment(finance, payment.id, "Funds received and signed off.");
    const signed = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(signed.status).toBe("CONFIRMED");
    expect(signed.confirmedById).toBe(finance.id);
  });
});

async function verifyRequestSafe(actor: StaffActor, requestId: string) {
  const { verifyRequest } = await import("@/server/requests");
  await verifyRequest(actor, requestId, "ACKNOWLEDGED", { assignedLab: "AL" });
}
