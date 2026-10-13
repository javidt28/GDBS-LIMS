"use client";

import { useState } from "react";
import { requestAction } from "@/server/actions";
import { DECISION_RULE_TEXT } from "@/lib/catalogue";

type Sample = {
  description: string;
  brandName: string;
  sizeQuantity: string;
  manufacturer: string;
  lotNo: string;
  bestBefore: string;
  collectionPoint: string;
  receiptNo: string;
  comments: string;
  collectorSignature: string;
};

const blank: Sample = {
  description: "",
  brandName: "",
  sizeQuantity: "",
  manufacturer: "",
  lotNo: "",
  bestBefore: "",
  collectionPoint: "",
  receiptNo: "",
  comments: "",
  collectorSignature: "",
};

export function RequestForm({
  requestId,
  initial,
}: {
  requestId?: string;
  initial: {
    clientName: string;
    clientAddress: string;
    contactPerson: string;
    contactNo: string;
    contactEmail: string;
    serviceType: string;
    serviceTypeOther: string;
    description: string;
    decisionRuleAck: boolean;
    signatureName: string;
    samples: Sample[];
  };
}) {
  const [samples, setSamples] = useState<Sample[]>(initial.samples.length ? initial.samples : [blank]);
  const [serviceType, setServiceType] = useState(initial.serviceType);

  return (
    <form action={requestAction} className="stack">
      {requestId && <input type="hidden" name="requestId" value={requestId} />}
      <section className="form-section">
        <h2>Section 1 — Client information</h2>
        <div className="form-grid">
          <label>Name<input name="clientName" required defaultValue={initial.clientName} /></label>
          <label>Address<textarea name="clientAddress" defaultValue={initial.clientAddress} /></label>
          <div className="two">
            <label>Contact person<input name="contactPerson" defaultValue={initial.contactPerson} /></label>
            <label>Contact no.<input name="contactNo" defaultValue={initial.contactNo} /></label>
          </div>
          <label>Email<input name="contactEmail" type="email" defaultValue={initial.contactEmail} /></label>
        </div>
      </section>
      <section className="form-section">
        <h2>Section 2 — Service requested</h2>
        <p className="help">Form GDBS-QMF-004, version 4.</p>
        <div className="form-grid">
          <label>
            Type of service
            <select name="serviceType" value={serviceType} onChange={(event) => setServiceType(event.target.value)} required>
              <option value="">Select</option>
              <option value="CALIBRATION">Calibration</option>
              <option value="VERIFICATION">Verification</option>
              <option value="TESTING">Testing</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          {serviceType === "OTHER" && (
            <label>Other service<input name="serviceTypeOther" defaultValue={initial.serviceTypeOther} /></label>
          )}
          <label>Description of service<textarea name="description" defaultValue={initial.description} /></label>
        </div>
      </section>
      <section className="form-section">
        <h2>Section 3 — Sample / item information</h2>
        {samples.map((sample, index) => (
          <fieldset key={index} className="panel" style={{ marginBottom: "0.75rem" }}>
            <legend>Sample {index + 1}</legend>
            <div className="form-grid">
              <label>Sample description<input name="sampleDescription" required={index === 0} defaultValue={sample.description} /></label>
              <div className="two">
                <label>Brand name<input name="brandName" defaultValue={sample.brandName} /></label>
                <label>Size / quantity<input name="sizeQuantity" defaultValue={sample.sizeQuantity} /></label>
              </div>
              <div className="two">
                <label>Manufacturer<input name="manufacturer" defaultValue={sample.manufacturer} /></label>
                <label>Lot no.<input name="lotNo" defaultValue={sample.lotNo} /></label>
              </div>
              <div className="two">
                <label>Best before / expiry<input type="date" name="bestBefore" defaultValue={sample.bestBefore} /></label>
                <label>Collection point<input name="collectionPoint" defaultValue={sample.collectionPoint} /></label>
              </div>
              <label>Receipt no.<input name="receiptNo" defaultValue={sample.receiptNo} /></label>
              <label>Comments<textarea name="comments" defaultValue={sample.comments} /></label>
              <label>Sample collected by<input name="collectorSignature" defaultValue={sample.collectorSignature} /></label>
            </div>
          </fieldset>
        ))}
        <button className="btn" type="button" onClick={() => setSamples([...samples, blank])}>Add another sample</button>
      </section>
      <section className="form-section">
        <h2>Decision rule</h2>
        <p>{DECISION_RULE_TEXT}</p>
        <label className="check">
          <input type="checkbox" name="decisionRuleAck" defaultChecked={initial.decisionRuleAck} />
          I acknowledge the Decision Rule.
        </label>
        <label>Client signature<input name="signatureName" defaultValue={initial.signatureName} /></label>
      </section>
      <div className="row-actions">
        <button className="btn" name="intent" value="draft" type="submit">Save draft</button>
        <button className="btn btn-primary" name="intent" value="submit" type="submit">Submit request</button>
      </div>
    </form>
  );
}
