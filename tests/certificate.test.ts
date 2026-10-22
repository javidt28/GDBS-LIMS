import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { REPORT_WARRANTY, UNCERTAINTY_STATEMENT, assessResult, averageReading, matchTemplateRow } from "@/lib/catalogue";
import { renderCertificatePdf } from "@/server/certificate-pdf";

describe("Simple Acceptance Decision Rule", () => {
  it("compares limits, ranges, and qualitative results", () => {
    expect(assessResult("15% (max)", "13.2")).toBe("Pass");
    expect(assessResult("15% (max)", "15.1")).toBe("FAIL");
    expect(assessResult("7% (min)", "8.0")).toBe("Pass");
    expect(assessResult("7% (min)", "6.4")).toBe("FAIL");
    expect(assessResult("6.5 - 8.5", "7.2")).toBe("Pass");
    expect(assessResult("6.5 - 8.5", "9")).toBe("FAIL");
    expect(assessResult("Absent", "Absent")).toBe("Pass");
    expect(assessResult("Absent", "Present")).toBe("FAIL");
    expect(assessResult("Normal", "Abnormal")).toBe("FAIL");
    expect(assessResult("15% (max)", "not detected")).toBeNull();
  });

  it("averages numeric raw-data readings", () => {
    expect(averageReading(["13.0", "13.2", "13.1"])).toBe("13.1");
    expect(averageReading(["Absent", ""])).toBeNull();
  });

  it("matches ANCF analysis names onto the flour certificate rows", () => {
    expect(matchTemplateRow("CERTIFICATE_OF_ANALYSIS", "Moisture Content (%)")?.requirement).toBe("15% (max)");
    expect(matchTemplateRow("CERTIFICATE_OF_ANALYSIS", "Protein (%)")?.analysis).toBe("Protein");
  });
});

describe("QMF-043 certificate PDF", () => {
  it("renders a single letter page from recorded results", async () => {
    const bytes = await renderCertificatePdf({
      title: "Certificate of Analysis",
      laboratory: "ANALYTICAL & MICROBIOLOGICAL LABORATORY",
      formNo: "GDBS-QMF-043",
      version: "03",
      formDate: "2022-02-02",
      certificateNo: "2026AL4/001",
      issuedAt: "2026-10-22",
      clientName: "Grand Anse Bakery (Demo)",
      clientAddress: "Grand Anse Main Road, St. George's",
      sampleDescription: "All-purpose wheat flour",
      brandName: "Island Mill",
      manufacturer: "Grenada Flour Mills",
      lotNo: "GF-2611",
      bestBefore: "2027-04-30",
      sizeQuantity: "2 kg",
      history: "Sample delivered to Laboratory by Inspector",
      dateSampled: "2026-10-14",
      dateCollected: "2026-10-15",
      dateOfAnalysis: "2026-10-16 to 2026-10-19",
      analysisPerformed: "Physical & Chemical Analysis",
      placeOfAnalysis: "GDBS Analytical Laboratory",
      procedures: "GDBS-EXTD-056; GDBS-ANCM-007",
      standard: "GDS 12: 1992 - Specification for Wheat Flour",
      rows: [
        { analysis: "Moisture Content", requirement: "15% (max)", actual: "13.2", uncertainty: "±0.3", comments: "Pass" },
        { analysis: "Protein", requirement: "7% (min)", actual: "6.4", uncertainty: "-", comments: "FAIL" },
        { analysis: "Presence of Potassium Bromate", requirement: "Absent", actual: "Absent", uncertainty: "-", comments: "Pass" },
      ],
      temperature: "24.6",
      humidity: "58.5",
      performedBy: "Kyla John",
      performedRole: "Technical Officer: Chemical Analysis",
      approvedBy: "Marlena Gabriel",
      approvedRole: "Head: Technical Services",
      warranty: REPORT_WARRANTY,
      uncertaintyStatement: UNCERTAINTY_STATEMENT,
      supersedes: null,
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(Math.round(pdf.getPage(0).getWidth())).toBe(612);
    expect(Math.round(pdf.getPage(0).getHeight())).toBe(792);
  });
});
