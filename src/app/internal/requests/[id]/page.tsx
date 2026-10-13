import Link from "next/link";
import { notFound } from "next/navigation";
import { ANALYSIS_GROUPS } from "@/lib/catalogue";
import { Banner, Empty, PageHeading, Status } from "@/components/shell";
import { createJobAction, receiveSampleAction, verifyRequestAction } from "@/server/actions";
import { can } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";

export default async function StaffRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const staff = await requireStaff();
  if (!can(staff.role, "requests.read")) return <Empty>You do not have permission to view requests.</Empty>;
  const { id } = await params;
  const query = await searchParams;
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    include: { samples: { include: { jobs: true } }, documents: true, quotations: true },
  });
  if (!request) notFound();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeading title={request.reference} crumbs={[{ href: "/internal/requests", label: "Requests" }]} action={<Status value={request.status} />} />
      <Banner error={query.error} />
      <section className="form-section">
        <h2>Submitted request</h2>
        <p>{request.clientName}<br />{request.clientAddress}</p>
        <p>{request.contactPerson} · {request.contactNo} · {request.contactEmail}</p>
        <p>Service: {request.serviceType} {request.serviceTypeOther ?? ""}</p>
        <p>{request.description}</p>
        <p>Decision rule: {request.decisionRuleAck ? request.signatureName : "Not acknowledged"}</p>
        <ul>{request.documents.map((document) => <li key={document.id}>{document.filename}</li>)}</ul>
      </section>
      {request.status === "SUBMITTED" && (
        <form action={verifyRequestAction} className="stack form-section">
          <h2>Section 4 — For official use</h2>
          <input type="hidden" name="requestId" value={request.id} />
          <label>Laboratory
            <select name="assignedLab">
              <option value="">Select</option>
              <option value="AL">Analytical / Microbiology (AL)</option>
              <option value="MBL">Microbiology (MBL)</option>
              <option value="EA">Environmental (EA)</option>
            </select>
          </label>
          <p className="help">Materials and metrology codes are not in the 2026 work-order log, so they are not offered here.</p>
          <label>Official comments<textarea name="officialComments" /></label>
          <label>Reason, if returning or rejecting<textarea name="reason" /></label>
          <div className="row-actions">
            <button className="btn btn-primary" name="decision" value="ACKNOWLEDGED">Acknowledge</button>
            <button className="btn" name="decision" value="RETURNED">Return</button>
            <button className="btn btn-danger" name="decision" value="REJECTED">Reject</button>
          </div>
        </form>
      )}
      {request.samples.map((sample) => (
        <section key={sample.id} className="form-section">
          <h2>Sample — {sample.description}</h2>
          <p>{sample.brandName} · {sample.sizeQuantity} · Lot {sample.lotNo || "—"}</p>
          {sample.jobs.map((job) => <p key={job.id}><Link href={`/internal/jobs/${job.id}`}>{job.jobNo}</Link> <Status value={job.status} /></p>)}
          {!sample.receivedAt && (
            <form action={receiveSampleAction} className="stack">
              <input type="hidden" name="sampleId" value={sample.id} />
              <input type="hidden" name="requestId" value={request.id} />
              <h3>Sample receipt — GDBS-ANCF-001</h3>
              <label>Analysis basis
                <select name="analysisBasis" required>
                  <option value="">Select</option>
                  <option value="STANDARD_COMPLIANCE">Standard compliance</option>
                  <option value="QUALITY_CONTROL">Quality control</option>
                  <option value="CLIENT_SPECIFIED">Client specified</option>
                </select>
              </label>
              <label>If client specified<input name="analysisBasisOther" /></label>
              <label>History<textarea name="history" /></label>
              <div className="two">
                <label>Storage location<input name="storageLocation" /></label>
                <label>Stored on<input type="date" name="storedOn" /></label>
              </div>
              <div className="two">
                <label>Date sampled<input type="date" name="dateSampled" /></label>
                <label>Date collected<input type="date" name="dateCollected" /></label>
              </div>
              <label>Sample size<input name="sampleSize" /></label>
              <label>Condition notes<textarea name="conditionNotes" /></label>
              <button className="btn btn-primary" type="submit">Record receipt</button>
            </form>
          )}
          {sample.receivedAt && sample.jobs.length === 0 && (
            <form action={createJobAction} className="stack">
              <input type="hidden" name="sampleId" value={sample.id} />
              <input type="hidden" name="requestId" value={request.id} />
              <h3>Open work order</h3>
              <div className="two">
                <label>Laboratory
                  <select name="lab" required defaultValue={request.assignedLab ?? "AL"}>
                    <option value="AL">AL</option>
                    <option value="MBL">MBL</option>
                    <option value="EA">EA</option>
                  </select>
                </label>
                <label>Job date<input type="date" name="jobDate" required defaultValue={today} /></label>
              </div>
              <label>Place of analysis<input name="placeOfAnalysis" /></label>
              <label>Procedure(s) used<textarea name="procedures" /></label>
              {ANALYSIS_GROUPS.map((group) => (
                <fieldset key={group.label}>
                  <legend>{group.label}</legend>
                  {group.names.map((name) => (
                    <label key={name} className="check"><input type="checkbox" name="analysis" value={name} />{name}</label>
                  ))}
                </fieldset>
              ))}
              <label className="check">Other<input name="analysis" placeholder="Other analysis" /></label>
              <button className="btn btn-primary" type="submit">Create work order</button>
            </form>
          )}
        </section>
      ))}
    </>
  );
}
