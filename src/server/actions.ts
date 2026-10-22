"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  authenticateClient,
  authenticateStaff,
  registerClient,
  requestPasswordReset,
  resetPassword,
  updateClientProfile,
  verifyEmail,
  createStaffUser,
  type StaffActor,
} from "@/server/accounts";
import { addQuotationLine, confirmPayment, createFee, createQuotation, decideQuotation, issueQuotation, openPayment, recordPaymentReference, setAcceptanceTerms } from "@/server/commercial";
import { appUrl, sendLinkEmail } from "@/server/email";
import { DomainError, isDomainError } from "@/server/errors";
import { createJob, decideVerification, receiveSample, saveEnvironment, saveJobDetails, saveReadings, saveResult, submitVerification } from "@/server/laboratory";
import { prisma } from "@/server/prisma";
import { issueReport, openReportCorrection } from "@/server/reports";
import { saveRequestDraft, submitRequest, verifyRequest, type RequestDraft } from "@/server/requests";
import { rateLimit } from "@/server/rate-limit";
import { clearClientSession, clearStaffSession, getClient, requireClient, requireStaff, startClientSession, startStaffSession } from "@/server/session";
import { assertUpload, savePrivateBytes } from "@/server/storage";
import { headers } from "next/headers";
import type { LabCode, PaymentMethod, ReportKind, ServiceType, StaffRole } from "@prisma/client";

function fail(error: unknown) {
  if (isRedirect(error)) throw error;
  if (isDomainError(error)) return error.message;
  console.error(error);
  return "The action could not be completed.";
}

async function clientAddressKey() {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for") ?? "local";
}

const registerSchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(1),
  password: z.string().min(12),
});

export async function registerAction(formData: FormData) {
  "use server";
  if (!rateLimit(`register:${await clientAddressKey()}`)) redirect("/create-account?error=Too+many+attempts.+Wait+and+try+again.");
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/create-account?error=Check+the+name,+email,+and+password.");
  try {
    const result = await registerClient(parsed.data);
    const link = appUrl(`/verify-email?token=${encodeURIComponent(result.verifyToken)}`);
    const sent = await sendLinkEmail({ kind: "verify", to: parsed.data.email, link, token: result.verifyToken });
    const devLink = sent || process.env.NODE_ENV === "production" ? "" : `&devToken=${encodeURIComponent(result.verifyToken)}`;
    redirect(`/create-account?sent=1${devLink}`);
  } catch (error) {
    redirect(`/create-account?error=${encodeURIComponent(fail(error))}`);
  }
}

export async function verifyEmailAction(formData: FormData) {
  "use server";
  try {
    await verifyEmail(String(formData.get("token") ?? ""));
  } catch (error) {
    redirect(`/verify-email?error=${encodeURIComponent(fail(error))}`);
  }
  redirect("/sign-in?verified=1");
}

export async function signInAction(formData: FormData) {
  "use server";
  if (!rateLimit(`login:${await clientAddressKey()}`)) redirect("/sign-in?error=Too+many+attempts.+Wait+and+try+again.");
  try {
    const user = await authenticateClient(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
    await startClientSession(user.id);
    if (!user.account.profileCompletedAt) redirect("/portal/onboarding");
    redirect("/portal");
  } catch (error) {
    if (error instanceof DomainError) redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
}

export async function signOutAction() {
  "use server";
  await clearClientSession();
  redirect("/");
}

export async function forgotPasswordAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const result = await requestPasswordReset(email);
  const sent = result.token
    ? await sendLinkEmail({ kind: "reset", to: email, link: appUrl(`/reset-password?token=${encodeURIComponent(result.token)}`), token: result.token })
    : false;
  const devLink = result.token && !sent && process.env.NODE_ENV !== "production" ? `&devToken=${encodeURIComponent(result.token)}` : "";
  redirect(`/forgot-password?sent=1${devLink}`);
}

export async function resetPasswordAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  try {
    await resetPassword(token, String(formData.get("password") ?? ""));
  } catch (error) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(fail(error))}`);
  }
  redirect("/sign-in?reset=1");
}

export async function staffSignInAction(formData: FormData) {
  "use server";
  if (!rateLimit(`staff-login:${await clientAddressKey()}`, 8)) {
    redirect("/internal/sign-in?error=Too+many+attempts.+Wait+and+try+again.");
  }
  try {
    const user = await authenticateStaff(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
    await startStaffSession(user.id);
  } catch (error) {
    if (error instanceof DomainError) redirect(`/internal/sign-in?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  redirect("/internal");
}

export async function staffSignOutAction() {
  "use server";
  await clearStaffSession();
  redirect("/internal/sign-in");
}

export async function profileAction(formData: FormData) {
  "use server";
  const user = await requireClient();
  try {
    await updateClientProfile(user.id, {
      kind: formData.get("kind") === "ORGANIZATION" ? "ORGANIZATION" : "INDIVIDUAL",
      name: String(formData.get("name") ?? ""),
      address: String(formData.get("address") ?? ""),
      contactPerson: String(formData.get("contactPerson") ?? ""),
      contactNo: String(formData.get("contactNo") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
    });
  } catch (error) {
    redirect(`/portal/onboarding?error=${encodeURIComponent(fail(error))}`);
  }
  redirect("/portal");
}

export async function accountAction(formData: FormData) {
  "use server";
  const user = await requireClient();
  try {
    await updateClientProfile(user.id, {
      kind: formData.get("kind") === "ORGANIZATION" ? "ORGANIZATION" : "INDIVIDUAL",
      name: String(formData.get("name") ?? ""),
      address: String(formData.get("address") ?? ""),
      contactPerson: String(formData.get("contactPerson") ?? ""),
      contactNo: String(formData.get("contactNo") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
    });
  } catch (error) {
    redirect(`/portal/account?error=${encodeURIComponent(fail(error))}`);
  }
  redirect("/portal/account?saved=1");
}

function draftFromForm(formData: FormData): RequestDraft {
  const descriptions = formData.getAll("sampleDescription").map(String);
  return {
    clientName: String(formData.get("clientName") ?? ""),
    clientAddress: String(formData.get("clientAddress") ?? ""),
    contactPerson: String(formData.get("contactPerson") ?? ""),
    contactNo: String(formData.get("contactNo") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    serviceType: String(formData.get("serviceType") ?? "") as ServiceType | "",
    serviceTypeOther: String(formData.get("serviceTypeOther") ?? ""),
    description: String(formData.get("description") ?? ""),
    decisionRuleAck: formData.get("decisionRuleAck") === "on",
    signatureName: String(formData.get("signatureName") ?? ""),
    samples: descriptions.map((description, index) => ({
      description,
      brandName: String(formData.getAll("brandName")[index] ?? ""),
      sizeQuantity: String(formData.getAll("sizeQuantity")[index] ?? ""),
      manufacturer: String(formData.getAll("manufacturer")[index] ?? ""),
      lotNo: String(formData.getAll("lotNo")[index] ?? ""),
      bestBefore: String(formData.getAll("bestBefore")[index] ?? ""),
      collectionPoint: String(formData.getAll("collectionPoint")[index] ?? ""),
      receiptNo: String(formData.getAll("receiptNo")[index] ?? ""),
      comments: String(formData.getAll("comments")[index] ?? ""),
      collectorSignature: String(formData.getAll("collectorSignature")[index] ?? ""),
    })),
  };
}

export async function requestAction(formData: FormData) {
  "use server";
  const user = await requireClient();
  const intent = String(formData.get("intent") ?? "draft");
  const requestId = String(formData.get("requestId") ?? "") || null;
  const draft = draftFromForm(formData);
  try {
    if (intent === "submit") {
      if (!requestId) {
        const created = await saveRequestDraft(user.accountId, user.id, null, draft);
        await submitRequest(user.accountId, user.id, created.id, draft);
        redirect(`/portal/requests/${created.id}?submitted=1`);
      }
      await submitRequest(user.accountId, user.id, requestId, draft);
      redirect(`/portal/requests/${requestId}?submitted=1`);
    }
    const saved = await saveRequestDraft(user.accountId, user.id, requestId, draft);
    redirect(`/portal/requests/${saved.id}?draft=1`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    const target = requestId ? `/portal/requests/${requestId}/edit` : "/portal/requests/new";
    redirect(`${target}?error=${encodeURIComponent(fail(error))}`);
  }
}

export async function uploadAction(formData: FormData) {
  "use server";
  const user = await requireClient();
  const requestId = String(formData.get("requestId") ?? "");
  const request = await prisma.serviceRequest.findFirst({ where: { id: requestId, accountId: user.accountId } });
  if (!request) redirect("/portal/requests");
  const file = formData.get("file");
  if (!(file instanceof File)) redirect(`/portal/requests/${requestId}?error=Choose+a+file.`);
  try {
    const extension = assertUpload({ type: file.type, size: file.size, name: file.name });
    const stored = await savePrivateBytes(Buffer.from(await file.arrayBuffer()), extension);
    await prisma.document.create({
      data: {
        requestId,
        storageKey: stored.key,
        filename: file.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 180) || "document",
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedByClientId: user.id,
      },
    });
  } catch (error) {
    redirect(`/portal/requests/${requestId}?error=${encodeURIComponent(fail(error))}`);
  }
  revalidatePath(`/portal/requests/${requestId}`);
  redirect(`/portal/requests/${requestId}`);
}

export async function verifyRequestAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const requestId = String(formData.get("requestId"));
  const decision = String(formData.get("decision")) as "ACKNOWLEDGED" | "RETURNED" | "REJECTED";
  try {
    await verifyRequest(staff, requestId, decision, {
      assignedLab: (String(formData.get("assignedLab") ?? "") || null) as LabCode | null,
      officialComments: String(formData.get("officialComments") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    redirect(`/internal/requests/${requestId}?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(`/internal/requests/${requestId}`);
}

export async function receiveSampleAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const sampleId = String(formData.get("sampleId"));
  const requestId = String(formData.get("requestId"));
  try {
    await receiveSample(staff, sampleId, {
      history: String(formData.get("history") ?? ""),
      storageLocation: String(formData.get("storageLocation") ?? ""),
      storedOn: String(formData.get("storedOn") ?? ""),
      analysisBasis: String(formData.get("analysisBasis") ?? "") as "STANDARD_COMPLIANCE" | "QUALITY_CONTROL" | "CLIENT_SPECIFIED" | "",
      analysisBasisOther: String(formData.get("analysisBasisOther") ?? ""),
      sampleSize: String(formData.get("sampleSize") ?? ""),
      conditionNotes: String(formData.get("conditionNotes") ?? ""),
      dateSampled: String(formData.get("dateSampled") ?? ""),
      dateCollected: String(formData.get("dateCollected") ?? ""),
    });
  } catch (error) {
    redirect(`/internal/requests/${requestId}?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(`/internal/requests/${requestId}`);
}

export async function createJobAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const requestId = String(formData.get("requestId") ?? "");
  try {
    const job = await createJob(staff, {
      sampleId: String(formData.get("sampleId")),
      lab: String(formData.get("lab")) as LabCode,
      jobDate: String(formData.get("jobDate")),
      serviceClass: "TECHNICAL_SERVICES",
      analysisNames: formData.getAll("analysis").map(String),
      procedures: String(formData.get("procedures") ?? ""),
      placeOfAnalysis: String(formData.get("placeOfAnalysis") ?? ""),
      standardUsed: String(formData.get("standardUsed") ?? ""),
      analysisPerformed: String(formData.get("analysisPerformed") ?? ""),
    });
    redirect(`/internal/jobs/${job.id}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    redirect(`/internal/requests/${requestId}?error=${encodeURIComponent(fail(error))}`);
  }
}

export async function jobDetailsAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const jobId = String(formData.get("jobId"));
  try {
    await saveJobDetails(staff, jobId, {
      procedures: String(formData.get("procedures") ?? ""),
      placeOfAnalysis: String(formData.get("placeOfAnalysis") ?? ""),
      standardUsed: String(formData.get("standardUsed") ?? ""),
      analysisPerformed: String(formData.get("analysisPerformed") ?? ""),
    });
  } catch (error) {
    redirect(`/internal/jobs/${jobId}?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(`/internal/jobs/${jobId}`);
}

export async function readingsAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const jobId = String(formData.get("jobId"));
  const analysisId = String(formData.get("analysisId"));
  const readings = [1, 2, 3, 4, 5].map((testNo) => ({
    testNo,
    reading: String(formData.get(`reading-${testNo}`) ?? ""),
    roomEquipTempC: String(formData.get(`temp-${testNo}`) ?? ""),
    weightG: String(formData.get(`weight-${testNo}`) ?? ""),
  }));
  try {
    await saveReadings(staff, analysisId, {
      readings,
      equipmentTag: String(formData.get("equipmentTag") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    redirect(`/internal/jobs/${jobId}?error=${encodeURIComponent(fail(error))}`);
  }
  revalidatePath(`/internal/jobs/${jobId}`);
  redirect(`/internal/jobs/${jobId}`);
}

export async function resultAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const jobId = String(formData.get("jobId"));
  try {
    await saveResult(staff, String(formData.get("analysisId")), {
      actualValue: String(formData.get("actualValue") ?? ""),
      units: String(formData.get("units") ?? ""),
      requirementText: String(formData.get("requirementText") ?? ""),
      uncertainty: String(formData.get("uncertainty") ?? ""),
      comments: String(formData.get("comments") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    redirect(`/internal/jobs/${jobId}?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(`/internal/jobs/${jobId}`);
}

export async function environmentAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const jobId = String(formData.get("jobId"));
  try {
    await saveEnvironment(staff, jobId, {
      tempStartC: String(formData.get("tempStartC") ?? ""),
      tempEndC: String(formData.get("tempEndC") ?? ""),
      humidityStart: String(formData.get("humidityStart") ?? ""),
      humidityEnd: String(formData.get("humidityEnd") ?? ""),
    });
  } catch (error) {
    redirect(`/internal/jobs/${jobId}?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(`/internal/jobs/${jobId}`);
}

export async function verificationAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const jobId = String(formData.get("jobId"));
  const ids = formData.getAll("analysisId").map(String);
  try {
    await submitVerification(staff, jobId, {
      notes: String(formData.get("notes") ?? ""),
      rows: ids.map((analysisId) => ({
        analysisId,
        completed: formData.getAll("completed").includes(analysisId),
        reported: formData.getAll("reported").includes(analysisId),
      })),
    });
  } catch (error) {
    redirect(`/internal/jobs/${jobId}?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(`/internal/jobs/${jobId}`);
}

export async function verificationDecisionAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const jobId = String(formData.get("jobId"));
  try {
    await decideVerification(staff, jobId, String(formData.get("decision")) as "VERIFIED" | "RETURNED", String(formData.get("reason") ?? ""));
  } catch (error) {
    redirect(`/internal/jobs/${jobId}?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(`/internal/jobs/${jobId}`);
}

export async function issueReportAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const jobId = String(formData.get("jobId"));
  try {
    await issueReport(staff, jobId, String(formData.get("kind")) as ReportKind);
  } catch (error) {
    redirect(`/internal/jobs/${jobId}?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(`/internal/jobs/${jobId}`);
}

export async function correctReportAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const jobId = String(formData.get("jobId"));
  try {
    await openReportCorrection(staff, String(formData.get("reportId")), String(formData.get("reason") ?? ""));
  } catch (error) {
    redirect(`/internal/jobs/${jobId}?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(`/internal/jobs/${jobId}`);
}

export async function quotationAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  const requestId = String(formData.get("requestId"));
  try {
    const intent = String(formData.get("intent"));
    if (intent === "create") {
      const quotation = await createQuotation(staff, requestId);
      redirect(`/internal/quotations/${quotation.id}`);
    }
    if (intent === "line") {
      await addQuotationLine(staff, String(formData.get("quotationId")), {
        feeScheduleId: String(formData.get("feeScheduleId")),
        quantity: Number(formData.get("quantity") ?? 1),
      });
    }
    if (intent === "issue") await issueQuotation(staff, String(formData.get("quotationId")));
  } catch (error) {
    if (isRedirect(error)) throw error;
    redirect(`/internal/requests/${requestId}?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(`/internal/requests/${requestId}`);
}

export async function clientQuotationAction(formData: FormData) {
  "use server";
  const user = await requireClient();
  const quotationId = String(formData.get("quotationId"));
  let requestId = "";
  let decision = "";
  try {
    decision = String(formData.get("decision"));
    const updated = await decideQuotation(
      user.id,
      user.accountId,
      quotationId,
      decision as "ACCEPTED" | "REJECTED",
      String(formData.get("reason") ?? ""),
    );
    requestId = updated.requestId;
  } catch (error) {
    redirect(`/portal/quotations?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(requestId ? `/portal/requests/${requestId}?tab=${decision === "ACCEPTED" ? "payment" : "invoice"}` : "/portal/quotations");
}

export async function paymentReferenceAction(formData: FormData) {
  "use server";
  const user = await requireClient();
  const requestId = String(formData.get("requestId") ?? "");
  try {
    await recordPaymentReference(user.accountId, user.id, String(formData.get("paymentId")), String(formData.get("reference") ?? ""));
  } catch (error) {
    redirect(requestId ? `/portal/requests/${requestId}?tab=payment&error=${encodeURIComponent(fail(error))}` : `/portal/payments?error=${encodeURIComponent(fail(error))}`);
  }
  redirect(requestId ? `/portal/requests/${requestId}?tab=payment` : "/portal/payments");
}

export async function paymentStaffAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  try {
    const intent = String(formData.get("intent"));
    if (intent === "open") {
      await openPayment(staff, String(formData.get("requestId")), String(formData.get("method")) as PaymentMethod);
    } else {
      await confirmPayment(staff, String(formData.get("paymentId")), String(formData.get("note") ?? ""));
    }
  } catch (error) {
    redirect(`/internal/payments?error=${encodeURIComponent(fail(error))}`);
  }
  redirect("/internal/payments");
}

export async function feeAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  try {
    await createFee(staff, {
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      unit: String(formData.get("unit") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      currency: String(formData.get("currency") ?? ""),
      effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
  } catch (error) {
    redirect(`/internal/fees?error=${encodeURIComponent(fail(error))}`);
  }
  redirect("/internal/fees");
}

export async function termsAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  try {
    await setAcceptanceTerms(staff, String(formData.get("terms") ?? ""));
  } catch (error) {
    redirect(`/internal/admin/settings?error=${encodeURIComponent(fail(error))}`);
  }
  redirect("/internal/admin/settings?saved=1");
}

export async function createStaffAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  try {
    await createStaffUser(staff, {
      email: String(formData.get("email") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      password: String(formData.get("password") ?? ""),
      role: String(formData.get("role")) as StaffRole,
      lab: (String(formData.get("lab") ?? "") || null) as LabCode | null,
    });
  } catch (error) {
    redirect(`/internal/admin/users?error=${encodeURIComponent(fail(error))}`);
  }
  redirect("/internal/admin/users?saved=1");
}

export async function numberingAction(formData: FormData) {
  "use server";
  const staff = await staffActor();
  if (staff.role !== "ADMINISTRATOR") redirect("/internal");
  const key = String(formData.get("key") ?? "");
  const value = Number(formData.get("value"));
  const reason = String(formData.get("reason") ?? "");
  if (!key.startsWith("cert:") && !key.startsWith("job:") && !key.startsWith("request:")) {
    redirect("/internal/admin/numbering?error=Unknown+sequence.");
  }
  if (!Number.isInteger(value) || value < 0 || !reason.trim()) {
    redirect("/internal/admin/numbering?error=Enter+the+current+value+and+a+reason.");
  }
  await prisma.numberSequence.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  const { audit } = await import("@/server/audit");
  await audit(prisma, {
    entity: "NumberSequence",
    entityId: key,
    action: "numbering.set",
    actorId: staff.id,
    actorType: "STAFF",
    after: { value },
    reason,
  });
  redirect("/internal/admin/numbering?saved=1");
}

export async function markNotificationAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const client = await getClient();
  const staff = client ? null : await requireStaff();
  await prisma.notification.updateMany({
    where: { id, ...(client ? { clientUserId: client.id } : { staffUserId: staff!.id }) },
    data: { readAt: new Date() },
  });
  redirect(client ? "/portal/notifications" : "/internal/notifications");
}

async function staffActor(): Promise<StaffActor> {
  const staff = await requireStaff();
  return { id: staff.id, role: staff.role, lab: staff.lab, fullName: staff.fullName };
}

function isRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).includes("NEXT_REDIRECT")
  );
}
