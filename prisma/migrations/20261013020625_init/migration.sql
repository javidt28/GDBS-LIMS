-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('RECEPTION', 'ANALYST', 'TECHNICAL_OFFICER', 'QUALITY_MANAGER', 'APPROVER', 'FINANCE', 'ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "LabCode" AS ENUM ('AL', 'MBL', 'EA');

-- CreateEnum
CREATE TYPE "ServiceClass" AS ENUM ('TECHNICAL_SERVICES', 'CONFORMITY_ASSESSMENT');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('CALIBRATION', 'VERIFICATION', 'TESTING', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'REJECTED', 'ACKNOWLEDGED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('CREATED', 'IN_ANALYSIS', 'RESULTS_ENTERED', 'AWAITING_VERIFICATION', 'VERIFIED', 'REPORT_ISSUED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnalysisBasis" AS ENUM ('STANDARD_COMPLIANCE', 'QUALITY_CONTROL', 'CLIENT_SPECIFIED');

-- CreateEnum
CREATE TYPE "SampleOrigin" AS ENUM ('CLIENT_REQUEST', 'INSPECTION', 'SURVEILLANCE');

-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('CERTIFICATE_OF_ANALYSIS', 'TEST_REPORT');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('ISSUED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPRICED', 'AWAITING', 'REFERENCE_SUBMITTED', 'CONFIRMED', 'WAIVED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHEQUE', 'DIRECT_DEPOSIT', 'WIRE_TRANSFER', 'TO_BE_INVOICED');

-- CreateEnum
CREATE TYPE "SessionRealm" AS ENUM ('CLIENT', 'STAFF');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('CLIENT', 'STAFF', 'SYSTEM');

-- CreateTable
CREATE TABLE "ClientAccount" (
    "id" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL DEFAULT 'INDIVIDUAL',
    "name" TEXT NOT NULL DEFAULT '',
    "address" TEXT,
    "contactPerson" TEXT,
    "contactNo" TEXT,
    "email" TEXT,
    "profileCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientUser" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "lab" "LabCode",
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "realm" "SessionRealm" NOT NULL,
    "clientUserId" TEXT,
    "staffUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "accountId" TEXT NOT NULL,
    "submittedById" TEXT,
    "clientName" TEXT NOT NULL DEFAULT '',
    "clientAddress" TEXT,
    "contactPerson" TEXT,
    "contactNo" TEXT,
    "contactEmail" TEXT,
    "serviceType" "ServiceType",
    "serviceTypeOther" TEXT,
    "description" TEXT,
    "decisionRuleAck" BOOLEAN NOT NULL DEFAULT false,
    "signatureName" TEXT,
    "signedAt" TIMESTAMP(3),
    "assignedLab" "LabCode",
    "responseAt" TIMESTAMP(3),
    "officialComments" TEXT,
    "rejectionReason" TEXT,
    "returnReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sample" (
    "id" TEXT NOT NULL,
    "origin" "SampleOrigin" NOT NULL DEFAULT 'CLIENT_REQUEST',
    "requestId" TEXT,
    "accountId" TEXT,
    "description" TEXT NOT NULL,
    "brandName" TEXT,
    "sizeQuantity" TEXT,
    "manufacturer" TEXT,
    "lotNo" TEXT,
    "bestBefore" DATE,
    "collectionPoint" TEXT,
    "receiptNo" TEXT,
    "comments" TEXT,
    "collectorSignature" TEXT,
    "history" TEXT,
    "storageLocation" TEXT,
    "storedOn" DATE,
    "analysisBasis" "AnalysisBasis",
    "analysisBasisOther" TEXT,
    "sampleSize" TEXT,
    "dateSampled" DATE,
    "dateCollected" DATE,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "conditionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "jobNo" TEXT NOT NULL,
    "daySequence" INTEGER NOT NULL,
    "jobDate" DATE NOT NULL,
    "lab" "LabCode" NOT NULL,
    "serviceClass" "ServiceClass" NOT NULL DEFAULT 'TECHNICAL_SERVICES',
    "status" "JobStatus" NOT NULL DEFAULT 'CREATED',
    "sampleId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "dateStarted" TIMESTAMP(3),
    "dateCompleted" TIMESTAMP(3),
    "procedures" TEXT,
    "placeOfAnalysis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAnalysis" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "reported" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawReading" (
    "id" TEXT NOT NULL,
    "jobAnalysisId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "testNo" INTEGER NOT NULL,
    "reading" TEXT NOT NULL,
    "roomEquipTempC" DECIMAL(8,2),
    "weightG" DECIMAL(12,4),
    "equipmentTag" TEXT,
    "performedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "RawReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "jobAnalysisId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "actualValue" TEXT NOT NULL,
    "units" TEXT,
    "requirementText" TEXT,
    "uncertainty" TEXT,
    "comments" TEXT,
    "enteredById" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultRevision" (
    "id" TEXT NOT NULL,
    "jobAnalysisId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actualValue" TEXT NOT NULL,
    "units" TEXT,
    "requirementText" TEXT,
    "uncertainty" TEXT,
    "comments" TEXT,
    "reason" TEXT NOT NULL,
    "correctedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvCondition" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "tempStartC" DECIMAL(6,2),
    "tempEndC" DECIMAL(6,2),
    "humidityStart" DECIMAL(6,2),
    "humidityEnd" DECIMAL(6,2),
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "EnvCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "status" "ReportStatus" NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "lab" "LabCode" NOT NULL,
    "certYear" INTEGER NOT NULL,
    "yearSequence" INTEGER NOT NULL,
    "sampleIndex" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "revisionOfId" TEXT,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeSchedule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "approvedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "acceptanceTerms" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "feeScheduleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPRICED',
    "method" "PaymentMethod",
    "amount" DECIMAL(12,2),
    "currency" TEXT,
    "clientReference" TEXT,
    "referenceSubmittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT,
    "staffUserId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientUser_email_key" ON "ClientUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_clientUserId_idx" ON "Session"("clientUserId");

-- CreateIndex
CREATE INDEX "Session_staffUserId_idx" ON "Session"("staffUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_email_purpose_idx" ON "EmailToken"("email", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_reference_key" ON "ServiceRequest"("reference");

-- CreateIndex
CREATE INDEX "ServiceRequest_accountId_status_idx" ON "ServiceRequest"("accountId", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");

-- CreateIndex
CREATE INDEX "Sample_requestId_idx" ON "Sample"("requestId");

-- CreateIndex
CREATE INDEX "Sample_accountId_origin_idx" ON "Sample"("accountId", "origin");

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobNo_key" ON "Job"("jobNo");

-- CreateIndex
CREATE INDEX "Job_status_lab_idx" ON "Job"("status", "lab");

-- CreateIndex
CREATE INDEX "Job_assigneeId_idx" ON "Job"("assigneeId");

-- CreateIndex
CREATE INDEX "Job_serviceClass_idx" ON "Job"("serviceClass");

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobDate_lab_daySequence_key" ON "Job"("jobDate", "lab", "daySequence");

-- CreateIndex
CREATE INDEX "JobAnalysis_jobId_idx" ON "JobAnalysis"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobAnalysis_jobId_name_key" ON "JobAnalysis"("jobId", "name");

-- CreateIndex
CREATE INDEX "RawReading_jobAnalysisId_revision_idx" ON "RawReading"("jobAnalysisId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Result_jobAnalysisId_key" ON "Result"("jobAnalysisId");

-- CreateIndex
CREATE INDEX "ResultRevision_jobAnalysisId_idx" ON "ResultRevision"("jobAnalysisId");

-- CreateIndex
CREATE INDEX "EnvCondition_jobId_revision_idx" ON "EnvCondition"("jobId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_jobId_key" ON "Verification"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_certificateNo_key" ON "Report"("certificateNo");

-- CreateIndex
CREATE INDEX "Report_jobId_status_idx" ON "Report"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Report_certYear_lab_yearSequence_key" ON "Report"("certYear", "lab", "yearSequence");

-- CreateIndex
CREATE UNIQUE INDEX "FeeSchedule_code_effectiveFrom_key" ON "FeeSchedule"("code", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Quotation_status_idx" ON "Quotation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_requestId_version_key" ON "Quotation"("requestId", "version");

-- CreateIndex
CREATE INDEX "QuotationLine_quotationId_idx" ON "QuotationLine"("quotationId");

-- CreateIndex
CREATE INDEX "Payment_requestId_status_idx" ON "Payment"("requestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_requestId_idx" ON "Document"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_clientUserId_readAt_idx" ON "Notification"("clientUserId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_staffUserId_readAt_idx" ON "Notification"("staffUserId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ClientUser" ADD CONSTRAINT "ClientUser_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ClientAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "ClientUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ClientAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "ClientUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ClientAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAnalysis" ADD CONSTRAINT "JobAnalysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawReading" ADD CONSTRAINT "RawReading_jobAnalysisId_fkey" FOREIGN KEY ("jobAnalysisId") REFERENCES "JobAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_jobAnalysisId_fkey" FOREIGN KEY ("jobAnalysisId") REFERENCES "JobAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultRevision" ADD CONSTRAINT "ResultRevision_jobAnalysisId_fkey" FOREIGN KEY ("jobAnalysisId") REFERENCES "JobAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvCondition" ADD CONSTRAINT "EnvCondition_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "ClientUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_feeScheduleId_fkey" FOREIGN KEY ("feeScheduleId") REFERENCES "FeeSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "ClientUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
