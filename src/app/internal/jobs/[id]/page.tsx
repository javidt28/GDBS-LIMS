import Link from "next/link";
import { notFound } from "next/navigation";
import { environmentWarnings } from "@/lib/catalogue";
import { Banner, PageHeading, Status } from "@/components/shell";
import {
  correctReportAction,
  environmentAction,
  issueReportAction,
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
  return (
    <>
      <PageHeading
        title={job.jobNo}
        crumbs={job.sample.request ? [{ href: `/internal/requests/${job.sample.request.id}`, label: job.sample.request.reference }] : []}
        action={<Status value={job.status} />}
      />
      <Banner error={query.error} />
      <p>{job.sample.description} · {job.serviceClass.replaceAll("_", " ")} · {job.lab}</p>
      {job.sample.origin !== "CLIENT_REQUEST" && <p className="banner-error">This sample is not visible in the client portal.</p>}
      <form action={environmentAction} className="stack form-section">
        <h2>Environmental conditions</h2>
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
      {job.analyses.map((analysis) => (
        <section key={analysis.id} className="form-section">
          <h2>{analysis.name}</h2>
          <form action={readingsAction} className="stack">
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="analysisId" value={analysis.id} />
            <div className="table-wrap">
              <table>
                <thead><tr><th>Test no.</th><th>Reading</th><th>Room/equip °C</th><th>Weight g</th></tr></thead>
                <tbody>
                  {[1, 2, 3, 4, 5].map((testNo) => {
                    const reading = analysis.readings.find((row) => row.testNo === testNo);
                    return (
                      <tr key={testNo}>
                        <td>{testNo}</td>
                        <td><input name={`reading-${testNo}`} defaultValue={reading?.reading ?? ""} /></td>
                        <td><input name={`temp-${testNo}`} defaultValue={reading?.roomEquipTempC?.toString() ?? ""} /></td>
                        <td><input name={`weight-${testNo}`} defaultValue={reading?.weightG?.toString() ?? ""} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <label>Equipment used<input name="equipmentTag" placeholder="GDBS-ALE-" defaultValue={analysis.readings[0]?.equipmentTag ?? ""} /></label>
            <label>Reason, required if this result was already reviewed<input name="reason" /></label>
            <button className="btn" type="submit">Save raw data</button>
          </form>
          <form action={resultAction} className="stack">
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="analysisId" value={analysis.id} />
            <div className="two">
              <label>Actual value<input name="actualValue" defaultValue={analysis.result?.actualValue ?? ""} /></label>
              <label>Units<input name="units" defaultValue={analysis.result?.units ?? ""} /></label>
            </div>
            <label>Requirement text<input name="requirementText" defaultValue={analysis.result?.requirementText ?? ""} /></label>
            <label>Uncertainty<input name="uncertainty" defaultValue={analysis.result?.uncertainty ?? ""} /></label>
            <label>Comments<textarea name="comments" defaultValue={analysis.result?.comments ?? ""} /></label>
            <label>Correction reason<input name="reason" /></label>
            <button className="btn" type="submit">Save result</button>
          </form>
          {analysis.revisions.length > 0 && <p className="help">{analysis.revisions.length} earlier result version{analysis.revisions.length === 1 ? "" : "s"} retained.</p>}
        </section>
      ))}
      <form action={verificationAction} className="stack form-section">
        <h2>GDBS-QMF-024 verification</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tests / analyses requested</th><th>Completed</th><th>Reported</th></tr></thead>
            <tbody>
              {job.analyses.map((analysis) => (
                <tr key={analysis.id}>
                  <td>{analysis.name}<input type="hidden" name="analysisId" value={analysis.id} /></td>
                  <td><input type="checkbox" name="completed" value={analysis.id} defaultChecked={analysis.completed} /></td>
                  <td><input type="checkbox" name="reported" value={analysis.id} defaultChecked={analysis.reported} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label>Notes<textarea name="notes" defaultValue={job.verification?.notes ?? ""} /></label>
        <input type="hidden" name="jobId" value={job.id} />
        <button className="btn btn-primary" type="submit">Submit checklist</button>
      </form>
      {job.status === "AWAITING_VERIFICATION" && (
        <form action={verificationDecisionAction} className="stack">
          <input type="hidden" name="jobId" value={job.id} />
          <label>Reason if returning<textarea name="reason" /></label>
          <div className="row-actions">
            <button className="btn btn-primary" name="decision" value="VERIFIED">Verify report</button>
            <button className="btn" name="decision" value="RETURNED">Return to analyst</button>
          </div>
        </form>
      )}
      {job.status === "VERIFIED" && (
        <form action={issueReportAction} className="row-actions">
          <input type="hidden" name="jobId" value={job.id} />
          <button className="btn btn-primary" name="kind" value="CERTIFICATE_OF_ANALYSIS">Issue certificate of analysis (QMF-043)</button>
          <button className="btn" name="kind" value="TEST_REPORT">Issue test report (QMF-044)</button>
        </form>
      )}
      <section className="form-section">
        <h2>Issued documents</h2>
        {job.reports.length === 0 ? <p>None.</p> : (
          <ul>
            {job.reports.map((report) => (
              <li key={report.id}>
                <Link href={`/files/reports/${report.id}`}>{report.certificateNo}/{String(report.sampleIndex).padStart(3, "0")}</Link> <Status value={report.status} /> revision {report.revision}
              </li>
            ))}
          </ul>
        )}
        {currentReport && (
          <form action={correctReportAction} className="stack">
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="reportId" value={currentReport.id} />
            <label>Reason for correction<textarea name="reason" required /></label>
            <button className="btn" type="submit">Open a correction. The issued file stays unchanged.</button>
          </form>
        )}
      </section>
    </>
  );
}
