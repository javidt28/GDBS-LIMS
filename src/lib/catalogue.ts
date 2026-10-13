/** Printed analyses on GDBS-ANCF-001 v7, page 2. Names only. No limits are printed on that form. */
export const ANCF_001_ANALYSES = [
  "pH",
  "Moisture Content (%)",
  "Broken",
  "Damage Kernel",
  "Red Striated Kernel",
  "Non-Gelatinize Kernel",
  "Chalky Kernel",
  "Yellow Kernel",
  "Amber Kernel",
  "Paddy",
  "Green Kernel",
  "Heat Damage Kernel",
  "Milling Yield",
  "Total Milled yield",
  "Organic",
  "Inorganic",
  "Organoleptic",
  "Free Chlorine (ppm)",
  "Total Dissolved Solids (ppm)",
  "Turbidity (NTU)",
  "Electrical Conductivity (EC) (mS/m)",
  "Bromine",
  "Protein (%)",
  "Ash (%)",
  "Brix (%)",
  "Salt by weight (%)",
  "Length to width ratio",
  "Water activity (aw)",
  "Viscosity",
  "Biochemical Oxygen Demand (BOD)",
  "Chemical Oxygen Demand (COD)",
  "Dissolved Oxygen (DO) (ppm)",
  "Specific Gravity",
  "Chlorophyll",
] as const;

const RICE_GRAIN = [
  "Broken",
  "Damage Kernel",
  "Red Striated Kernel",
  "Non-Gelatinize Kernel",
  "Chalky Kernel",
  "Yellow Kernel",
  "Amber Kernel",
  "Paddy",
  "Green Kernel",
  "Heat Damage Kernel",
  "Milling Yield",
  "Total Milled yield",
] as const;

const GROUPED = new Set<string>(["pH", "Moisture Content (%)", "Organic", "Inorganic", ...RICE_GRAIN]);

export const ANALYSIS_GROUPS: { label: string; names: readonly string[] }[] = [
  { label: "General", names: ["pH", "Moisture Content (%)"] },
  { label: "Rice Grain Analysis", names: RICE_GRAIN },
  { label: "Total Foreign Matter", names: ["Organic", "Inorganic"] },
  { label: "Other printed analyses", names: ANCF_001_ANALYSES.filter((name) => !GROUPED.has(name)) },
];

/** Acceptable ranges printed on GDBS-ANCF-001 v7. They warn; they do not block a save. */
export function environmentWarnings(input: {
  analysisNames: string[];
  tempStart?: number | null;
  tempEnd?: number | null;
  humidityStart?: number | null;
  humidityEnd?: number | null;
}) {
  const warnings: string[] = [];
  const temps = [input.tempStart, input.tempEnd].filter((value): value is number => value != null);
  const humidities = [input.humidityStart, input.humidityEnd].filter((value): value is number => value != null);
  const names = input.analysisNames.map((name) => name.toLowerCase());

  const inRange = (value: number, min: number, max: number) => value >= min && value <= max;
  const checkTemp = (min: number, max: number, label: string) => {
    if (temps.some((value) => !inRange(value, min, max))) {
      warnings.push(`Temperature is outside the printed range for ${label}: ${min}–${max} °C.`);
    }
  };

  if (names.some((name) => ["ph", "electrical conductivity", "total dissolved solids", "water activity"].some((key) => name.includes(key)))) {
    checkTemp(23, 27, "pH, EC, TDS, and water activity");
  }
  if (names.some((name) => name.includes("moisture"))) checkTemp(20, 30, "moisture");
  if (names.some((name) => name.includes("brix"))) checkTemp(19, 21, "Brix");
  if (humidities.some((value) => !inRange(value, 40, 75))) {
    warnings.push("Humidity is outside the printed range of 40–75%.");
  }
  return warnings;
}

export type TemplateRow = {
  analysis: string;
  requirement: string;
  uncertainty: string;
};

/** Requirement column printed on the Certificate sheet of the flour template. Not example results. */
export const FLOUR_TEMPLATE_ROWS: TemplateRow[] = [
  { analysis: "Moisture Content", requirement: "15% (max)", uncertainty: "±0.3" },
  { analysis: "Protein", requirement: "7% (min)", uncertainty: "—" },
  { analysis: "Presence of Potassium Bromate", requirement: "Absent", uncertainty: "—" },
];

/**
 * Requirement column printed on the Certificate sheet of GDBS-QMF-044.
 * Where the Results sheet and the Certificate sheet disagree, the Certificate sheet is used.
 */
export const WATER_TEMPLATE_ROWS: TemplateRow[] = [
  { analysis: "Total Coliform", requirement: "0 CFU per 250 ml", uncertainty: "—" },
  { analysis: "E. coli", requirement: "0 CFU per 250 ml", uncertainty: "—" },
  { analysis: "Thermotolerant (Faecal) Coliform", requirement: "0 CFU per 250 ml", uncertainty: "—" },
  { analysis: "Pseudomonas aeruginosa", requirement: "0 CFU per 250 ml", uncertainty: "—" },
  { analysis: "TVC @ 37C/48h", requirement: "20 CFU per ml", uncertainty: "—" },
  { analysis: "TVC @ 22C/72h", requirement: "100 CFU per ml", uncertainty: "—" },
  { analysis: "Enterococci Count", requirement: "0 CFU per 250 ml", uncertainty: "—" },
  { analysis: "pH @ 25o C", requirement: "6.5 - 8.5", uncertainty: "± 0.8" },
  { analysis: "Free Chlorine", requirement: "2 mg/L (max)", uncertainty: "—" },
  { analysis: "Total Dissolved Solids", requirement: "1000 mg/L (max)", uncertainty: "—" },
  { analysis: "Turbidity", requirement: "≤ 1 NTU", uncertainty: "—" },
  { analysis: "Electrical Conductivity", requirement: "5.00 - 50.00 mS/m", uncertainty: "—" },
  { analysis: "Organoleptic (Sight & Smell)", requirement: "Normal", uncertainty: "—" },
];

export const REPORT_WARRANTY =
  "The Grenada Bureau of Standards (GDBS) warrants that all testing and calibrations for the purposes of this certificate or report was conducted in accordance with the applicable standard laboratory practices. This certificate or report is a correct record of the measurements and observations made in respect of the specific sample or item identified. The GDBS applies a Simple Acceptance Decision Rule for quantitative results; opinions and interpretations (if provided) are guided by this Rule. The GDBS accepts no responsibility or liability for any loss or damage which may be sustained as a result of the use of this certificate or report. This certificate or report shall not be used for purposes of advertising, publicity or litigation, and shall not be reproduced, whether in a part or in full, without the written consent of the Director of the GDBS. Misuse of any information contained in this certificate or report may lead to penalties under the Standards Act.";

export const UNCERTAINTY_STATEMENT =
  "The uncertainty of measurement represents the expanded uncertainty which is obtained from the standard uncertainty by multiplication by the expansion factor k=2 with a 95% confidence interval.";

export const TEMPLATE_META = {
  CERTIFICATE_OF_ANALYSIS: {
    formNo: "GDBS-QMF-043",
    version: "03",
    dateIssued: "2022-02-02",
    title: "Certificate of Analysis",
    laboratory: "ANALYTICAL & MICROBIOLOGICAL LABORATORY",
    rows: FLOUR_TEMPLATE_ROWS,
    standard: "GDS 12: 1992 - Specification for Wheat Flour",
    analysisPerformed: "Physical & Chemical Analysis",
  },
  TEST_REPORT: {
    formNo: "GDBS-QMF-044",
    version: "03",
    dateIssued: "2022-02-01",
    title: "Test Report",
    laboratory: "MICROBIOLOGICAL & ANALYTICAL LABORATORY",
    rows: WATER_TEMPLATE_ROWS,
    standard:
      "GDS 71: 2020 - Specification For Packaged Water; WHO - Guidelines for Drinking Water",
    analysisPerformed: "Microbiological & Chemical Analysis",
  },
} as const;

export function matchTemplateRow(kind: keyof typeof TEMPLATE_META, analysisName: string) {
  const rows = TEMPLATE_META[kind].rows;
  const needle = normalize(analysisName);
  return rows.find((row) => needle.includes(normalize(row.analysis)) || normalize(row.analysis).includes(needle));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const PUBLIC_LABORATORIES = [
  {
    name: "Analytical chemistry",
    summary:
      "Chemical testing of water, agro-processed goods, and products covered by GDBS conformity assessment programmes, as published by the Bureau.",
  },
  {
    name: "Microbiology",
    summary:
      "Microbiological testing of food and water, as published by the Bureau.",
  },
  {
    name: "Materials testing",
    summary:
      "Testing of soils, concrete products, asphalt, and aggregates for the construction sector, as published by the Bureau.",
  },
  {
    name: "Metrology",
    summary:
      "Calibration and verification services of the National Metrology Institute, as published by the Bureau.",
  },
] as const;

export const DECISION_RULE_TEXT =
  "GDBS employs a Simple Acceptance Decision Rule to determine conformity of results made in the certificates/reports, where applicable. By signing, you acknowledge that you understand the conditions of the service requested and have read and agree to the terms of the Decision Rule.";
