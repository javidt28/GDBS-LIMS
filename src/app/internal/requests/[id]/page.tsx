import Link from "next/link";
import { notFound } from "next/navigation";
import { ANALYSIS_GROUPS } from "@/lib/catalogue";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { Banner, Card, Empty, Facts, PageHeading, Status } from "@/components/shell";
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
    include: { samples: { include: { jobs: true } }, documents: true, quotations: { orderBy: { version: "desc" } }, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!request) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const service = [humanize(request.serviceType), request.serviceTypeOther].filter(Boolean).join(" · ");
  return (
    <>
      <PageHeading
        title={request.reference}
        crumbs={[{ href: "/internal/requests", label: "Requests" }]}
        meta={<>{request.clientName || "Client"}{request.submittedAt && <> · Submitted {formatDateTime(request.submittedAt)}</>}</>}
        action={<Status value={request.status} />}
      />
      <Banner error={query.error} />

      <div className="detail-grid">
        <div className="detail-main">
          <Card title="Client and contact">
            <Facts
              items={[
                ["Client", request.clientName && can(staff.role, "clients.read")
                  ? <Link href={`/internal/clients/${request.accountId}`}>{request.clientName}</Link>
                  : request.clientName],
                ["Contact person", request.contactPerson],
                ["Phone", request.contactNo],
                ["Email", request.contactEmail && <a href={`mailto:${request.contactEmail}`}>{request.contactEmail}</a>],
                ["Address", request.clientAddress, true],
              ]}
            />
          </Card>

          <Card title="Request">
            <Facts
              items={[
                ["Service", service],
                ["Decision rule", request.decisionRuleAck ? `Acknowledged by ${request.signatureName}` : "Not acknowledged"],
                ["Description", request.description, true],
              ]}
            />
          </Card>

          <Card title="Supporting documents">
            {request.documents.length === 0 ? (
              <p className="card-note">No documents were uploaded.</p>
            ) : (
              <ul className="file-list">
                {request.documents.map((document) => (
                  <li key={document.id}>
                    <a href={`/files/documents/${document.id}`}>{document.filename}</a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {request.samples.map((sample, index) => (
            <Card
              key={sample.id}
              title={<>Sample {request.samples.length > 1 ? index + 1 : ""} <span className="card-title-sub">{sample.description}</span></>}
              action={<span className={sample.receivedAt ? "chip chip-good" : "chip"}>{sample.receivedAt ? "Received" : "Not yet received"}</span>}
            >
              <Facts
                items={[
                  ["Brand", sample.brandName],
                  ["Size or quantity", sample.sizeQuantity],
                  ["Lot number", sample.lotNo],
                  ["Received", formatDateTime(sample.receivedAt)],
                ]}
              />

              {sample.jobs.length > 0 && (
                <ul className="list list-inset">
                  {sample.jobs.map((job) => (
                    <li key={job.id}>
                      <Link href={`/internal/jobs/${job.id}`}>
                        <span>
                          <strong>Work order {job.jobNo}</strong>
                          <small>{job.lab} · {formatDate(job.jobDate)}</small>
                        </span>
                        <Status value={job.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {!sample.receivedAt && (
                <form action={receiveSampleAction} className="stack subform">
                  <input type="hidden" name="sampleId" value={sample.id} />
                  <input type="hidden" name="requestId" value={request.id} />
                  <h3>Sample receipt <span className="form-code">GDBS-ANCF-001</span></h3>
                  <div className="two">
                    <label>Analysis basis
                      <select name="analysisBasis" required>
                        <option value="">Select</option>
                        <option value="STANDARD_COMPLIANCE">Standard compliance</option>
                        <option value="QUALITY_CONTROL">Quality control</option>
                        <option value="CLIENT_SPECIFIED">Client specified</option>
                      </select>
                    </label>
                    <label>If client specified<input name="analysisBasisOther" /></label>
                  </div>
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
                <form action={createJobAction} className="stack subform">
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
                  <label>Place of analysis<input name="placeOfAnalysis" placeholder="GDBS Analytical Laboratory" /></label>
                  <label>Analysis performed<input name="analysisPerformed" placeholder="Physical & Chemical Analysis" /></label>
                  <label>Procedure(s) used<textarea name="procedures" placeholder="GDBS-EXTD-056; GDBS-ANCM-007" /></label>
                  <label>Standard used<input name="standardUsed" placeholder="GDS 12: 1992 - Specification for Wheat Flour" /></label>
                  <div className="check-groups">
                    {ANALYSIS_GROUPS.map((group) => (
                      <fieldset key={group.label}>
                        <legend>{group.label}</legend>
                        {group.names.map((name) => (
                          <label key={name} className="check"><input type="checkbox" name="analysis" value={name} />{name}</label>
                        ))}
                      </fieldset>
                    ))}
                  </div>
                  <label>Other analysis<input name="analysis" placeholder="Other analysis" /></label>
                  <button className="btn btn-primary" type="submit">Create work order</button>
                </form>
              )}
            </Card>
          ))}
        </div>

        <aside className="detail-side">
          {request.status === "SUBMITTED" && (
            <Card title="For official use" className="card-accent">
              <form action={verifyRequestAction} className="stack">
                <p className="card-note">Section 4 of the request form. Choose a laboratory, then acknowledge, return, or reject. Acknowledging generates an invoice from matching approved fees.</p>
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
            </Card>
          )}

          <Card title="Summary">
            <Facts
              items={[
                ["Status", <Status key="s" value={request.status} />],
                ["Submitted", formatDateTime(request.submittedAt)],
                ["Laboratory", request.assignedLab],
                ["Responded", formatDateTime(request.responseAt)],
                ["Samples", String(request.samples.length)],
                [
                  "Invoice",
                  request.quotations[0]
                    ? can(staff.role, "quotations.read")
                      ? <Link key="q" href={`/internal/quotations/${request.quotations[0].id}`}>{request.quotations[0].status.replaceAll("_", " ")}</Link>
                      : request.quotations[0].status.replaceAll("_", " ")
                    : "Not generated",
                ],
                [
                  "Payment",
                  request.payments[0]
                    ? can(staff.role, "payments.read")
                      ? <Link key="p" href="/internal/payments">{request.payments[0].status.replaceAll("_", " ")}</Link>
                      : request.payments[0].status.replaceAll("_", " ")
                    : "Not opened",
                ],
              ]}
            />
            {request.officialComments && <p className="card-note">{request.officialComments}</p>}
            {request.returnReason && <p className="banner-error">Returned: {request.returnReason}</p>}
            {request.rejectionReason && <p className="banner-error">Rejected: {request.rejectionReason}</p>}
          </Card>
        </aside>
      </div>
    </>
  );
}
