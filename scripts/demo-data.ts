/**
 * Demonstration data for presenting the LIMS.
 *
 *   DATABASE_URL=... npx tsx scripts/demo-data.ts seed
 *   DATABASE_URL=... npx tsx scripts/demo-data.ts clean
 *
 * Every record is fictional and marked: client logins end in @demo.example, staff logins end in
 * @demo.gdbs.test, client names end in "(Demo)", and fees use DEMO- codes with a "not an official
 * GDBS fee" note. `clean` removes exactly those records and the files issued for them.
 */
import { randomBytes } from "node:crypto";
import type { AnalysisBasis, LabCode, PaymentMethod, ReportKind, StaffRole } from "@prisma/client";

const CLIENT_DOMAIN = "@demo.example";
const STAFF_DOMAIN = "@demo.gdbs.test";
const FEE_PREFIX = "DEMO-";
const TERMS_PREFIX = "DEMO TERMS";
const SURVEILLANCE_TAG = "(Demo)";

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the database to change.");
  process.exit(1);
}

type Actor = { id: string; role: StaffRole; lab: LabCode | null; fullName: string };

const days = (n: number) => new Date(Date.now() - n * 86_400_000);
const isoDay = (n: number) => days(n).toISOString().slice(0, 10);

async function seed() {
  const { prisma } = await import("../src/server/prisma");
  const { hashPassword } = await import("../src/server/crypto");
  const { registerClient, verifyEmail } = await import("../src/server/accounts");
  const { saveRequestDraft, submitRequest, verifyRequest } = await import("../src/server/requests");
  const lab = await import("../src/server/laboratory");
  const commercial = await import("../src/server/commercial");
  const { issueReport } = await import("../src/server/reports");

  const existing = await prisma.clientUser.count({ where: { email: { endsWith: CLIENT_DOMAIN } } });
  if (existing) {
    console.error("Demo data is already loaded. Run `clean` first to reload it.");
    process.exit(1);
  }

  const password = `demo-${randomBytes(4).toString("hex")}-${randomBytes(4).toString("hex")}`;
  const passwordHash = await hashPassword(password);

  async function staff(role: StaffRole, email: string, fullName: string, labCode: LabCode | null = null): Promise<Actor> {
    const row = await prisma.staffUser.create({ data: { email: `${email}${STAFF_DOMAIN}`, fullName, role, lab: labCode, passwordHash } });
    return { id: row.id, role: row.role, lab: row.lab, fullName: row.fullName };
  }
  const admin = await staff("ADMINISTRATOR", "administrator", "Demo Administrator");
  const reception = await staff("RECEPTION", "reception", "Demo Reception Officer");
  const analyst = await staff("ANALYST", "analyst", "Demo Analyst", "AL");
  const approver = await staff("APPROVER", "approver", "Demo Approver");
  const finance = await staff("FINANCE", "finance", "Demo Finance Officer");
  await staff("QUALITY_MANAGER", "quality", "Demo Quality Manager");

  const feeRows: [string, string, number][] = [
    ["PH", "pH", 40],
    ["MOIST", "Moisture content", 55],
    ["PROT", "Protein", 85],
    ["ASH", "Ash", 60],
    ["BRIX", "Brix", 45],
    ["WATER", "Drinking water panel", 150],
    ["RICE", "Rice grain analysis", 120],
  ];
  const fees: Record<string, string> = {};
  for (const [code, name, amount] of feeRows) {
    const fee = await commercial.createFee(admin, {
      code: `${FEE_PREFIX}${code}`,
      name: `Demo – ${name}`,
      unit: "per sample",
      amount: amount.toFixed(2),
      currency: "XCD",
      effectiveFrom: isoDay(60),
      notes: "Placeholder for demonstration only. Not an official GDBS fee.",
    });
    fees[code] = fee.id;
  }
  const terms = await prisma.systemSetting.findUnique({ where: { key: "quotation.acceptanceTerms" } });
  if (!terms) {
    await commercial.setAcceptanceTerms(admin, `${TERMS_PREFIX}: placeholder for demonstration only. Accepting confirms the quoted demo amounts.`);
  }

  async function client(email: string, person: string, company: string, address: string, phone: string) {
    const created = await registerClient({ email: `${email}${CLIENT_DOMAIN}`, password, fullName: person });
    await verifyEmail(created.verifyToken);
    const user = await prisma.clientUser.findUniqueOrThrow({ where: { id: created.userId } });
    await prisma.clientAccount.update({
      where: { id: user.accountId },
      data: {
        kind: "ORGANIZATION",
        name: company,
        address,
        contactPerson: person,
        contactNo: phone,
        email: user.email,
        profileCompletedAt: new Date(),
      },
    });
    return { userId: user.id, accountId: user.accountId, email: user.email, person, company, address, phone };
  }
  type Client = Awaited<ReturnType<typeof client>>;

  const spice = await client("marcia.joseph", "Marcia Joseph", "Island Spice Processors Ltd (Demo)", "Demo Estate, Morne Rouge, St. George", "473-555-0101");
  const water = await client("devon.charles", "Devon Charles", "Carib Fresh Water Co. (Demo)", "Demo Industrial Park, Frequente, St. George", "473-555-0102");
  const bakery = await client("shelly.mitchell", "Shelly-Ann Mitchell", "Grand Anse Bakery (Demo)", "Demo Plaza, Grand Anse, St. George", "473-555-0103");
  const rice = await client("andre.baptiste", "Andre Baptiste", "Westerhall Rice Traders (Demo)", "Demo Wharf, Grenville, St. Andrew", "473-555-0104");

  type Sample = { description: string; brandName?: string; sizeQuantity?: string; lotNo?: string; manufacturer?: string };
  async function request(c: Client, description: string, samples: Sample[], opts: { submit?: boolean; daysAgo?: number } = {}) {
    const draft = {
      clientName: c.company,
      clientAddress: c.address,
      contactPerson: c.person,
      contactNo: c.phone,
      contactEmail: c.email,
      serviceType: "TESTING" as const,
      description,
      decisionRuleAck: true,
      signatureName: c.person,
      samples,
    };
    const saved = await saveRequestDraft(c.accountId, c.userId, null, draft);
    if (opts.submit === false) return saved.id;
    await submitRequest(c.accountId, c.userId, saved.id, draft);
    if (opts.daysAgo) {
      const when = days(opts.daysAgo);
      await prisma.serviceRequest.update({ where: { id: saved.id }, data: { submittedAt: when, signedAt: when, createdAt: when } });
      await prisma.auditLog.updateMany({ where: { entity: "ServiceRequest", entityId: saved.id }, data: { createdAt: when } });
    }
    return saved.id;
  }

  async function acknowledge(requestId: string, labCode: LabCode, daysAgo: number) {
    await verifyRequest(reception, requestId, "ACKNOWLEDGED", { assignedLab: labCode, officialComments: "Sample can be tested as requested." });
    const when = days(daysAgo);
    await prisma.serviceRequest.update({ where: { id: requestId }, data: { responseAt: when } });
    await prisma.auditLog.updateMany({ where: { entity: "ServiceRequest", entityId: requestId, action: "request.acknowledged" }, data: { createdAt: when } });
  }

  async function receive(requestId: string, basis: AnalysisBasis, daysAgo: number) {
    const samples = await prisma.sample.findMany({ where: { requestId }, orderBy: { createdAt: "asc" } });
    for (const sample of samples) {
      await lab.receiveSample(reception, sample.id, {
        analysisBasis: basis,
        storageLocation: "Sample store, shelf B",
        storedOn: isoDay(daysAgo),
        sampleSize: sample.sizeQuantity ?? "",
        conditionNotes: "Sealed and intact on arrival.",
        history: "Sample delivered to Laboratory by Inspector",
        dateSampled: isoDay(daysAgo + 1),
        dateCollected: isoDay(daysAgo),
      });
      await prisma.sample.update({ where: { id: sample.id }, data: { receivedAt: days(daysAgo) } });
    }
    return samples;
  }

  type Analysis = { name: string; value?: string; units?: string; readings?: string[]; requirement?: string; uncertainty?: string; comments?: string };
  async function job(sampleId: string, labCode: LabCode, daysAgo: number, analyses: Analysis[], stage: "created" | "partial" | "awaiting" | "issued", kind: ReportKind = "CERTIFICATE_OF_ANALYSIS") {
    const created = await lab.createJob(reception, {
      sampleId,
      lab: labCode,
      jobDate: isoDay(daysAgo),
      serviceClass: "TECHNICAL_SERVICES",
      analysisNames: analyses.map((analysis) => analysis.name),
      procedures: kind === "CERTIFICATE_OF_ANALYSIS" ? "GDBS-EXTD-056; GDBS-ANCM-007" : "Laboratory method on file (demo).",
      placeOfAnalysis: labCode === "AL" ? "GDBS Analytical Laboratory" : "GDBS laboratory, Queen's Park",
      analysisPerformed: kind === "CERTIFICATE_OF_ANALYSIS" ? "Physical & Chemical Analysis" : "Microbiological & Chemical Analysis",
      assigneeId: analyst.id,
    });
    if (stage === "created") return created;
    await lab.saveEnvironment(analyst, created.id, { tempStartC: "23", tempEndC: "24", humidityStart: "52", humidityEnd: "55" });
    const rows = await prisma.jobAnalysis.findMany({ where: { jobId: created.id }, orderBy: { sortOrder: "asc" } });
    for (const [index, row] of rows.entries()) {
      const spec = analyses.find((analysis) => analysis.name === row.name)!;
      if (stage === "partial" && index > 0) break;
      if (spec.readings) {
        await lab.saveReadings(analyst, row.id, {
          readings: spec.readings.map((reading, i) => ({ testNo: i + 1, reading, roomEquipTempC: "23.5" })),
          equipmentTag: "GDBS-ALE-DEMO",
        });
      }
      if (spec.value) {
        await lab.saveResult(analyst, row.id, {
          actualValue: spec.value,
          units: spec.units,
          requirementText: spec.requirement,
          uncertainty: spec.uncertainty,
          comments: spec.comments,
        });
      }
    }
    if (stage === "partial") return created;
    await lab.submitVerification(analyst, created.id, {
      rows: rows.map((row) => ({ analysisId: row.id, completed: true, reported: true })),
      notes: "All requested analyses completed.",
    });
    if (stage === "awaiting") return created;
    await lab.decideVerification(approver, created.id, "VERIFIED");
    const report = await issueReport(approver, created.id, kind);
    await prisma.report.update({ where: { id: report.id }, data: { issuedAt: days(Math.max(daysAgo - 2, 0)) } });
    return created;
  }

  async function quote(c: Client, requestId: string, lines: [string, number][], outcome: "issued" | "accepted") {
    const quotation = await commercial.createQuotation(finance, requestId);
    for (const [code, quantity] of lines) await commercial.addQuotationLine(finance, quotation.id, { feeScheduleId: fees[code], quantity });
    await commercial.issueQuotation(finance, quotation.id);
    if (outcome === "accepted") await commercial.decideQuotation(c.userId, c.accountId, quotation.id, "ACCEPTED");
  }

  async function pay(c: Client, requestId: string, method: PaymentMethod, reference: string | null, confirm: boolean) {
    const payment = await commercial.openPayment(finance, requestId, method);
    if (reference) await commercial.recordPaymentReference(c.accountId, c.userId, payment.id, reference);
    if (confirm) await commercial.confirmPayment(finance, payment.id, "Matched to bank statement (demo).");
  }

  // 1. Completed months ago: test report issued and paid.
  const older = await request(spice, "Moisture check on ground nutmeg for export.", [
    { description: "Ground nutmeg", brandName: "Spice Isle Gold (Demo)", sizeQuantity: "500 g", lotNo: "GN-0926" },
  ], { daysAgo: 32 });
  await acknowledge(older, "AL", 31);
  await quote(spice, older, [["MOIST", 1]], "accepted");
  await pay(spice, older, "DIRECT_DEPOSIT", "DEMO-DEP-30418", true);
  const [olderSample] = await receive(older, "QUALITY_CONTROL", 30);
  await job(olderSample.id, "AL", 29, [{ name: "Moisture Content (%)", value: "7.9", units: "%", readings: ["7.8", "8.0", "7.9"] }], "issued", "TEST_REPORT");

  // 2. Completed: certificate of analysis issued and paid.
  const syrup = await request(spice, "pH and Brix on nutmeg syrup before a new production run.", [
    { description: "Nutmeg syrup", brandName: "Spice Isle Gold (Demo)", sizeQuantity: "2 × 750 ml", lotNo: "NS-1014", manufacturer: "Island Spice Processors Ltd (Demo)" },
  ], { daysAgo: 12 });
  await acknowledge(syrup, "AL", 11);
  await quote(spice, syrup, [["PH", 1], ["BRIX", 1]], "accepted");
  await pay(spice, syrup, "WIRE_TRANSFER", "DEMO-WIRE-88217", true);
  const [syrupSample] = await receive(syrup, "STANDARD_COMPLIANCE", 10);
  await job(syrupSample.id, "AL", 9, [
    { name: "pH", value: "3.8", readings: ["3.79", "3.81", "3.80"] },
    { name: "Brix (%)", value: "64.5", units: "%", readings: ["64.4", "64.6", "64.5"] },
  ], "issued");

  // 3. Results entered, waiting for the approver. Client has paid and sent a reference.
  const bottled = await request(water, "Routine quality check on bottled drinking water.", [
    { description: "Bottled drinking water", brandName: "Carib Fresh (Demo)", sizeQuantity: "6 × 1.5 L", lotNo: "CF-2210-A" },
  ], { daysAgo: 6 });
  await acknowledge(bottled, "EA", 6);
  await quote(water, bottled, [["WATER", 1]], "accepted");
  await pay(water, bottled, "DIRECT_DEPOSIT", "DEMO-DEP-51120", false);
  const [bottledSample] = await receive(bottled, "QUALITY_CONTROL", 5);
  await job(bottledSample.id, "EA", 4, [
    { name: "pH", value: "7.2", readings: ["7.21", "7.19", "7.20"] },
    { name: "Total Dissolved Solids (ppm)", value: "118", units: "ppm", readings: ["117", "119", "118"] },
    { name: "Turbidity (NTU)", value: "0.4", units: "NTU", readings: ["0.4", "0.5", "0.4"] },
    { name: "Free Chlorine (ppm)", value: "0.2", units: "ppm", readings: ["0.2", "0.2", "0.2"] },
  ], "awaiting");

  // 4. In analysis: one of three results entered. Quotation issued, waiting for the client.
  const flour = await request(bakery, "Moisture, protein and ash on a new flour supplier.", [
    { description: "Wheat flour, all purpose", brandName: "Golden Mill (Demo)", sizeQuantity: "2 kg", lotNo: "WF-7781" },
  ], { daysAgo: 4 });
  await acknowledge(flour, "AL", 3);
  await quote(bakery, flour, [["MOIST", 1], ["PROT", 1], ["ASH", 1]], "issued");
  const [flourSample] = await receive(flour, "QUALITY_CONTROL", 2);
  await job(flourSample.id, "AL", 2, [
    { name: "Moisture Content (%)", value: "13.1", units: "%", readings: ["13.0", "13.2", "13.1"] },
    { name: "Protein (%)" },
    { name: "Ash (%)" },
  ], "partial");

  // 5. Acknowledged; the sample has not arrived yet.
  const pending = await request(water, "Second batch from the new filling line.", [
    { description: "Bottled drinking water", brandName: "Carib Fresh (Demo)", sizeQuantity: "6 × 500 ml", lotNo: "CF-2210-B" },
  ], { daysAgo: 2 });
  await acknowledge(pending, "EA", 1);

  // 6. Returned to the client for more information.
  const returned = await request(bakery, "Moisture on cornmeal from two suppliers.", [
    { description: "Cornmeal, supplier A" },
    { description: "Cornmeal, supplier B" },
  ], { daysAgo: 3 });
  await verifyRequest(reception, returned, "RETURNED", { reason: "Please add the lot number and pack size for each sample." });

  // 7. Submitted today, waiting for reception to review.
  await request(rice, "Grain quality on an imported parboiled rice shipment.", [
    { description: "Parboiled rice", brandName: "Harvest Pride (Demo)", sizeQuantity: "1 kg", lotNo: "PR-5530" },
  ], { daysAgo: 0 });
  await request(water, "Free chlorine check after a filter change.", [
    { description: "Treated process water", sizeQuantity: "1 L" },
  ], { daysAgo: 1 });

  // 8. A draft the client has not submitted yet.
  await request(rice, "Long grain rice, broken and chalky kernel count.", [{ description: "Long grain rice" }], { submit: false });

  // 9. Staff-only conformity assessment work. Never shown in the client portal.
  const surveillance = await prisma.sample.create({
    data: {
      origin: "SURVEILLANCE",
      description: `Market surveillance – imported rice ${SURVEILLANCE_TAG}`,
      receivedAt: days(1),
      receivedById: reception.id,
      analysisBasis: "STANDARD_COMPLIANCE",
    },
  });
  await lab.createJob(reception, {
    sampleId: surveillance.id,
    lab: "AL",
    jobDate: isoDay(1),
    serviceClass: "CONFORMITY_ASSESSMENT",
    analysisNames: ["Broken", "Chalky Kernel", "Moisture Content (%)"],
    assigneeId: analyst.id,
  });

  // Two client logins also see a notification they have not read; mark the rest read.
  await prisma.notification.updateMany({ where: { clientUser: { email: { endsWith: CLIENT_DOMAIN } }, createdAt: { lt: days(5) } }, data: { readAt: new Date() } });

  console.log("\nDemo data loaded.\n");
  console.log(`Password for every demo login: ${password}\n`);
  console.log("Staff (sign in at /internal/sign-in):");
  for (const name of ["reception", "analyst", "approver", "finance", "quality"]) console.log(`  ${name}${STAFF_DOMAIN}`);
  console.log("\nClients (sign in at /sign-in):");
  for (const c of [spice, water, bakery, rice]) console.log(`  ${c.email}  ${c.company}`);
  await prisma.$disconnect();
}

async function clean() {
  const { prisma } = await import("../src/server/prisma");
  const { deletePrivateBytes } = await import("../src/server/storage");

  const clients = await prisma.clientUser.findMany({ where: { email: { endsWith: CLIENT_DOMAIN } } });
  const staff = await prisma.staffUser.findMany({ where: { email: { endsWith: STAFF_DOMAIN } } });
  const accountIds = [...new Set(clients.map((user) => user.accountId))];
  const requests = await prisma.serviceRequest.findMany({ where: { accountId: { in: accountIds } }, select: { id: true } });
  const requestIds = requests.map((row) => row.id);
  const samples = await prisma.sample.findMany({
    where: {
      OR: [
        { requestId: { in: requestIds } },
        { accountId: { in: accountIds } },
        { accountId: null, requestId: null, description: { endsWith: SURVEILLANCE_TAG } },
      ],
    },
    select: { id: true },
  });
  const sampleIds = samples.map((row) => row.id);
  const jobs = await prisma.job.findMany({ where: { sampleId: { in: sampleIds } }, select: { id: true } });
  const jobIds = jobs.map((row) => row.id);
  const reports = await prisma.report.findMany({ where: { jobId: { in: jobIds } }, select: { id: true, storageKey: true } });
  const documents = await prisma.document.findMany({ where: { requestId: { in: requestIds } }, select: { id: true, storageKey: true } });
  const analyses = await prisma.jobAnalysis.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } });
  const analysisIds = analyses.map((row) => row.id);
  const quotations = await prisma.quotation.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } });
  const quotationIds = quotations.map((row) => row.id);
  const payments = await prisma.payment.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } });
  const fees = await prisma.feeSchedule.findMany({ where: { code: { startsWith: FEE_PREFIX } }, select: { id: true } });
  const clientIds = clients.map((user) => user.id);
  const staffIds = staff.map((user) => user.id);
  const entityIds = [
    ...requestIds, ...sampleIds, ...jobIds, ...reports.map((row) => row.id), ...quotationIds,
    ...payments.map((row) => row.id), ...fees.map((row) => row.id), ...accountIds, ...clientIds, ...staffIds,
    ...analysisIds,
  ];

  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({ where: { OR: [{ clientUserId: { in: clientIds } }, { staffUserId: { in: staffIds } }] } });
    await tx.session.deleteMany({ where: { OR: [{ clientUserId: { in: clientIds } }, { staffUserId: { in: staffIds } }] } });
    await tx.emailToken.deleteMany({ where: { email: { endsWith: CLIENT_DOMAIN } } });
    await tx.rawReading.deleteMany({ where: { jobAnalysisId: { in: analysisIds } } });
    await tx.result.deleteMany({ where: { jobAnalysisId: { in: analysisIds } } });
    await tx.resultRevision.deleteMany({ where: { jobAnalysisId: { in: analysisIds } } });
    await tx.jobAnalysis.deleteMany({ where: { id: { in: analysisIds } } });
    await tx.envCondition.deleteMany({ where: { jobId: { in: jobIds } } });
    await tx.verification.deleteMany({ where: { jobId: { in: jobIds } } });
    await tx.report.updateMany({ where: { jobId: { in: jobIds } }, data: { revisionOfId: null } });
    await tx.report.deleteMany({ where: { jobId: { in: jobIds } } });
    await tx.job.deleteMany({ where: { id: { in: jobIds } } });
    await tx.sample.deleteMany({ where: { id: { in: sampleIds } } });
    await tx.quotationLine.deleteMany({ where: { quotationId: { in: quotationIds } } });
    await tx.quotation.deleteMany({ where: { id: { in: quotationIds } } });
    await tx.payment.deleteMany({ where: { requestId: { in: requestIds } } });
    await tx.document.deleteMany({ where: { requestId: { in: requestIds } } });
    await tx.serviceRequest.deleteMany({ where: { id: { in: requestIds } } });
    await tx.clientUser.deleteMany({ where: { id: { in: clientIds } } });
    await tx.clientAccount.deleteMany({ where: { id: { in: accountIds } } });
    await tx.feeSchedule.deleteMany({ where: { id: { in: fees.map((row) => row.id) }, lines: { none: {} } } });
    await tx.staffUser.deleteMany({ where: { id: { in: staffIds } } });
    await tx.auditLog.deleteMany({ where: { OR: [{ entityId: { in: entityIds } }, { actorId: { in: [...clientIds, ...staffIds] } }] } });
    const terms = await tx.systemSetting.findUnique({ where: { key: "quotation.acceptanceTerms" } });
    if (typeof terms?.value === "string" && terms.value.startsWith(TERMS_PREFIX)) {
      await tx.systemSetting.delete({ where: { key: "quotation.acceptanceTerms" } });
      await tx.auditLog.deleteMany({ where: { entity: "SystemSetting", entityId: "quotation.acceptanceTerms" } });
    }
    const remaining = (await tx.serviceRequest.count()) + (await tx.job.count()) + (await tx.report.count());
    if (remaining === 0) await tx.numberSequence.deleteMany({});
  });

  for (const file of [...reports, ...documents]) {
    await deletePrivateBytes(file.storageKey).catch(() => undefined);
  }

  console.log(`Removed ${clients.length} demo clients, ${staff.length} demo staff, ${requestIds.length} requests, ${jobIds.length} work orders, ${reports.length} issued documents.`);
  await prisma.$disconnect();
}

const command = process.argv[2];
if (command === "seed") void seed();
else if (command === "clean") void clean();
else {
  console.error("Usage: tsx scripts/demo-data.ts seed|clean");
  process.exit(1);
}
