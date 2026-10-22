import Link from "next/link";
import { notFound } from "next/navigation";
import { assessResult, averageReading, environmentWarnings, templateDefaults } from "@/lib/catalogue";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { Banner, Card, Facts, PageHeading, Status } from "@/components/shell";
import {
  correctReportAction,
  environmentAction,
  issueReportAction,
  jobDetailsAction,
  readingsAction,
  resultAction,
  verificationAction,
  verificationDecisionAction,
} from "@/server/actions";
import { jobInclude } from "@/server/laboratory";
import { prisma } from "@/server/prisma";
import { requireStaff } from "@/server/session";

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const query = await searchParams;
  const job = await prisma.job.findUnique({ where: { id }, include: jobInclude });
  if (!job) notFound();
  const env = job.envConditions[0];
  const warnings = environmentWarnings({
    analysisNames: job.analyses.map((analysis) => analysis.name),
    tempStart: env?.tempStartC ? Number(env.tempStartC) : null,
    tempEnd: env?.tempEndC ? Number(env.tempEndC) : null,
    humidityStart: env?.humidityStart ? Number(env.humidityStart) : null,
    humidityEnd: env?.humidityEnd ? Number(env.humidityEnd) : null,
  });
  const currentReport = job.reports.find((report) => report.status === "ISSUED");
  const completed = job.analyses.filter((analysis) => analysis.completed).length;
  return (
    <>
      <PageHeading
        title={job.jobNo}
        crumbs={[
          { href: "/internal/jobs", label: "Work orders" },
          ...(job.sample.request ? [{ href: `/internal/requests/${job.sample.request.id}`, label: job.sample.request.reference }] : []),
        ]}
        meta={<>{job.sample.description} · {humanize(job.serviceClass)} · {job.lab}</>}
        action={<Status value={job.status} />}
      />
      <Banner error={query.error} />
      {job.sample.origin !== "CLIENT_REQUEST" && <p className="banner-error">This sample is not visible in the client portal.</p>}

      <div className="detail-grid">
        <div className="detail-main">
          <Card title="Certificate details">
            <p className="card-note">These fields print on GDBS-QMF-043 and GDBS-QMF-044. Record them here, then save each analysis result. Previewing a draft uses the values on this page; issuing assigns the certificate number.</p>
            {["AWAITING_VERIFICATION", "VERIFIED", "REPORT_ISSUED", "CANCELLED"].includes(job.status) ? (
              <Facts
                items={[
                  ["Analysis performed", job.analysisPerformed],
                  ["Place of analysis", job.placeOfAnalysis],
                  ["Procedure(s) used", job.procedures],
                  ["Standard used", job.standardUsed],
                ]}
              />
            ) : (
              <form action={jobDetailsAction} className="stack">
                <input type="hidden" name="jobId" value={job.id} />
                <label>Analysis performed<input name="analysisPerformed" defaultValue={job.analysisPerformed ?? ""} placeholder="Physical & Chemical Analysis" /></label>
                <label>Place of analysis<input name="placeOfAnalysis" defaultValue={job.placeOfAnalysis ?? ""} /></label>
                <label>Procedure(s) used<input name="procedures" defaultValue={job.procedures ?? ""} placeholder="GDBS-EXTD-056; GDBS-ANCM-007" /></label>
                <label>Standard used<input name="standardUsed" defaultValue={job.standardUsed ?? ""} placeholder="GDS 12: 1992 - Specification for Wheat Flour" /></label>
                <button className="btn" type="submit">Save certificate details</button>
              </form>
            )}
          </Card>

          <Card title="Environmental conditions">
            <form action={environmentAction} className="stack">
              <input type="hidden" name="jobId" value={job.id} />
              <div className="two">
                <label>Temperature start °C<input name="tempStartC" defaultValue={env?.tempStartC?.toString() ?? ""} /></label>
                <label>Temperature end °C<input name="tempEndC" defaultValue={env?.tempEndC?.toString() ?? ""} /></label>
                <label>Humidity start %<input name="humidityStart" defaultValue={env?.humidityStart?.toString() ?? ""} /></label>
                <label>Humidity end %<input name="humidityEnd" defaultValue={env?.humidityEnd?.toString() ?? ""} /></label>
              </div>
              {warnings.map((warning) => <p key={warning} className="banner-error">{warning}</p>)}
              <button className="btn" type="submit">Save conditions</button>
            </form>
          </Card>

          {job.analyses.map((analysis) => {
            const matched = templateDefaults(analysis.name);
            const requirement = analysis.result?.requirementText ?? matched?.requirement ?? "";
            const mean = averageReading(analysis.readings.map((row) => row.reading));
            const actual = analysis.result?.actualValue ?? mean ?? "";
            const suggested = assessResult(requirement, actual);
            return (
            <Card
              key={analysis.id}
              title={analysis.name}
              action={
                analysis.result?.actualValue
                  ? <span className={analysis.result.comments === "FAIL" ? "chip chip-bad" : "chip chip-good"}>{analysis.result.actualValue}{analysis.result.units ? ` ${analysis.result.units}` : ""}{analysis.result.comments ? ` · ${analysis.result.comments}` : ""}</span>
                  : <span className="chip">No result yet</span>
              }
            >
              <form action={readingsAction} className="stack">
                <h3>Raw data</h3>
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="analysisId" value={analysis.id} />
                <div className="table-wrap table-inputs">
                  <table>
                    <thead><tr><th>Test no.</th><th>Reading</th><th>Room/equip °C</th><th>Weight g</th></tr></thead>
                    <tbody>
                      {[1, 2, 3, 4, 5].map((testNo) => {
                        const reading = analysis.readings.find((row) => row.testNo === testNo);
                        return (
                          <tr key={testNo}>
                            <td>{testNo}</td>
                            <td><input aria-label={`Reading ${testNo}`} name={`reading-${testNo}`} defaultValue={reading?.reading ?? ""} /></td>
                            <td><input aria-label={`Room or equipment temperature ${testNo}`} name={`temp-${testNo}`} defaultValue={reading?.roomEquipTempC?.toString() ?? ""} /></td>
                            <td><input aria-label={`Weight ${testNo}`} name={`weight-${testNo}`} defaultValue={reading?.weightG?.toString() ?? ""} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="two">
                  <label>Equipment used<input name="equipmentTag" placeholder="GDBS-ALE-" defaultValue={analysis.readings[0]?.equipmentTag ?? ""} /></label>
                  <label>Reason, required if this result was already reviewed<input name="reason" /></label>
                </div>
                {mean && !analysis.result && <p className="help">Mean of the numeric readings: {mean}. That figure is offered as the actual value until you save a result.</p>}
                <button className="btn" type="submit">Save raw data</button>
              </form>

              <form action={resultAction} className="stack subform">
                <h3>Result</h3>
                <p className="help">These columns print on the certificate: requirement, actual, uncertainty (k=2), and comments (Pass or FAIL).</p>
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="analysisId" value={analysis.id} />
                <div className="two">
                  <label>Actual value<input name="actualValue" defaultValue={actual} /></label>
                  <label>Units<input name="units" defaultValue={analysis.result?.units ?? ""} /></label>
                  <label>Requirement of standard<input name="requirementText" defaultValue={requirement} placeholder={matched?.requirement} /></label>
                  <label>Uncertainty (k=2)<input name="uncertainty" defaultValue={analysis.result?.uncertainty ?? matched?.uncertainty ?? ""} /></label>
                </div>
                <label>Comments
                  <input name="comments" defaultValue={analysis.result?.comments ?? suggested ?? ""} placeholder="Pass or FAIL" />
                </label>
                {suggested && !analysis.result?.comments && <p className="help">Simple Acceptance Decision Rule: {suggested}.</p>}
                <label>Correction reason<input name="reason" /></label>
                <button className="btn" type="submit">Save result</button>
              </form>
              {analysis.revisions.length > 0 && <p className="help">{analysis.revisions.length} earlier result version{analysis.revisions.length === 1 ? "" : "s"} retained.</p>}
            </Card>
            );
          })}

          <Card title={<>Verification checklist <span className="form-code">GDBS-QMF-024</span></>}>
            <form action={verificationAction} className="stack">
              <p className="help">Mark the analyses that were done. A result is required only for those marked completed or reported.</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Tests / analyses requested</th><th>Completed</th><th>Reported</th></tr></thead>
                  <tbody>
                    {job.analyses.map((analysis) => (
                      <tr key={analysis.id}>
                        <td>
                          {analysis.name}
                          {!analysis.result && <span className="help"> · no result yet</span>}
                          <input type="hidden" name="analysisId" value={analysis.id} />
                        </td>
                        <td><input aria-label={`${analysis.name} completed`} type="checkbox" name="completed" value={analysis.id} defaultChecked={analysis.completed || Boolean(analysis.result)} /></td>
                        <td><input aria-label={`${analysis.name} reported`} type="checkbox" name="reported" value={analysis.id} defaultChecked={analysis.reported || Boolean(analysis.result)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label>Notes<textarea name="notes" defaultValue={job.verification?.notes ?? ""} /></label>
              <input type="hidden" name="jobId" value={job.id} />
              <button className="btn btn-primary" type="submit">Submit checklist</button>
            </form>
          </Card>
        </div>

        <aside className="detail-side">
          <Card title="Summary">
            <Facts
              items={[
                ["Status", <Status key="s" value={job.status} />],
                ["Request", job.sample.request && <Link href={`/internal/requests/${job.sample.request.id}`}>{job.sample.request.reference}</Link>],
                ["Sample", job.sample.description],
                ["Laboratory", job.lab],
                ["Job date", formatDate(job.jobDate)],
                ["Analyses completed", `${completed} of ${job.analyses.length}`],
                ["Place of analysis", job.placeOfAnalysis],
                ["Standard used", job.standardUsed],
                ["Started", formatDateTime(job.dateStarted)],
              ]}
            />
          </Card>

          {job.status === "AWAITING_VERIFICATION" && (
            <Card title="Verification decision" className="card-accent">
              <form action={verificationDecisionAction} className="stack">
                <input type="hidden" name="jobId" value={job.id} />
                <label>Reason if returning<textarea name="reason" /></label>
                <div className="row-actions">
                  <button className="btn btn-primary" name="decision" value="VERIFIED">Verify report</button>
                  <button className="btn" name="decision" value="RETURNED">Return to analyst</button>
                </div>
              </form>
            </Card>
          )}

          <Card title="Draft document">
            <p className="card-note">Opens a watermarked draft from the results recorded on this work order. The certificate number is assigned only when an approver issues the document.</p>
            <div className="stack">
              <a className="btn" href={`/files/jobs/${job.id}/preview?kind=CERTIFICATE_OF_ANALYSIS`}>Preview certificate of analysis</a>
              <a className="btn" href={`/files/jobs/${job.id}/preview?kind=TEST_REPORT`}>Preview test report</a>
            </div>
          </Card>

          {job.status === "VERIFIED" && (
            <Card title="Issue document" className="card-accent">
              <form action={issueReportAction} className="stack">
                <input type="hidden" name="jobId" value={job.id} />
                <button className="btn btn-primary" name="kind" value="CERTIFICATE_OF_ANALYSIS">Issue certificate of analysis (QMF-043)</button>
                <button className="btn" name="kind" value="TEST_REPORT">Issue test report (QMF-044)</button>
              </form>
            </Card>
          )}

          <Card title="Issued documents">
            {job.reports.length === 0 ? (
              <p className="card-note">Nothing issued yet.</p>
            ) : (
              <ul className="file-list">
                {job.reports.map((report) => (
                  <li key={report.id}>
                    <Link href={`/files/reports/${report.id}`}>{report.certificateNo}/{String(report.sampleIndex).padStart(3, "0")}</Link>
                    <span className="file-meta">Revision {report.revision} · {formatDate(report.issuedAt)}</span>
                    <Status value={report.status} />
                  </li>
                ))}
              </ul>
            )}
            {currentReport && (
              <form action={correctReportAction} className="stack subform">
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="reportId" value={currentReport.id} />
                <label>Reason for correction<textarea name="reason" required /></label>
                <p className="help">Opening a correction leaves the issued file unchanged.</p>
                <button className="btn" type="submit">Open a correction</button>
              </form>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
