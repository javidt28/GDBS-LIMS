import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  clip,
  degrees,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setLineWidth,
  setStrokingRgbColor,
  setTextRenderingMode,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

export type CertificateRow = { analysis: string; requirement: string; actual: string; uncertainty: string; comments: string };

export type CertificateContent = {
  title: string;
  laboratory: string;
  formNo: string;
  version: string;
  formDate: string;
  certificateNo: string;
  issuedAt: string;
  clientName: string;
  clientAddress: string;
  sampleDescription: string;
  brandName: string;
  manufacturer: string;
  lotNo: string;
  bestBefore: string;
  sizeQuantity: string;
  history: string;
  dateSampled: string;
  dateCollected: string;
  dateOfAnalysis: string;
  analysisPerformed: string;
  placeOfAnalysis: string;
  procedures: string;
  standard: string;
  rows: CertificateRow[];
  temperature: string;
  humidity: string;
  performedBy: string;
  performedRole: string;
  approvedBy: string;
  approvedRole: string;
  warranty: string;
  uncertaintyStatement: string;
  supersedes: string | null;
};

const PAGE: [number, number] = [612, 792];
const INK = rgb(0.08, 0.08, 0.08);
const LINE = rgb(0.28, 0.28, 0.28);
const GRAY = rgb(0.753, 0.753, 0.753);
const FRAME = { left: 54, band: 117, right: 564, top: 100, bottom: 689 };
const CERT_BAR = 19;
const LABEL_X = 126;
const VALUE_X = 205;
const CONTENT_RIGHT = 560;
/** Column edges of the RESULTS table on the QMF-043 Certificate sheet. */
const COLUMNS = [124, 254, 335, 400, 465, 550];
const SIGNATURE_COLUMNS = [124, 293, 465, 550];
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

let logoBytes: Promise<Buffer | null> | null = null;

function loadLogo() {
  logoBytes ??= readFile(path.join(process.cwd(), "public/brand/gdbs-logo.png")).catch(() => null);
  return logoBytes;
}

export async function renderCertificatePdf(input: CertificateContent, options: { draft?: boolean } = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.title} ${input.certificateNo}`);
  pdf.setAuthor("Grenada Bureau of Standards");
  const page = pdf.addPage(PAGE);
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    serif: await pdf.embedFont(StandardFonts.TimesRomanBold),
  };
  const pen = new Pen(page);
  page.drawRectangle({ x: 0, y: 0, width: PAGE[0], height: PAGE[1], color: rgb(1, 1, 1) });

  const logo = await loadLogo();
  if (logo) {
    const image = await pdf.embedPng(logo);
    const height = 58;
    pen.image(image, 44, 24, (image.width / image.height) * height, height);
  }

  const centre = 340;
  pen.centred("GRENADA BUREAU OF STANDARDS", centre, 42, fonts.bold, 16);
  pen.centred(input.laboratory, centre, 56, fonts.bold, 9);
  pen.centred("P.O. Box 2036, Queen's Park, St. George's, Grenada", centre, 68, fonts.regular, 8);
  pen.centred("Tel: (473) 440-5886/6783    Fax: (473) 440-5554", centre, 80, fonts.regular, 8);
  pen.centred("Email: gdbs@spiceisle.com    Website: www.gdbs.gd", centre, 91, fonts.regular, 8);

  pen.fill(FRAME.left, FRAME.top, FRAME.band, FRAME.bottom, GRAY);
  pen.fill(FRAME.band, FRAME.top, FRAME.right, FRAME.top + CERT_BAR, GRAY);
  pen.rect(FRAME.left, FRAME.top, FRAME.right, FRAME.bottom);
  pen.vline(FRAME.band, FRAME.top, FRAME.bottom);
  pen.rect(312, FRAME.top, FRAME.right, FRAME.top + CERT_BAR);
  pen.centred(`Certificate No.  ${input.certificateNo}`, (312 + FRAME.right) / 2, FRAME.top + 13, fonts.bold, 9);

  drawSpineTitle(page, input.title, fonts.serif);

  const many = input.rows.length > 4;
  const step = many ? 9.8 : 11.6;
  let t = 132;
  const heading = (text: string) => {
    pen.text(text, LABEL_X, t, fonts.bold, 7.5);
    t += step - 0.5;
  };
  const field = (label: string, value: string) => {
    pen.text(label, LABEL_X, t, fonts.regular, 7.5);
    const lines = wrap(value, fonts.regular, 7.5, CONTENT_RIGHT - VALUE_X);
    lines.forEach((line, index) => pen.text(line, VALUE_X, t + index * (many ? 8 : 9), fonts.regular, 7.5));
    t += step + (lines.length - 1) * (many ? 8 : 9);
  };

  heading("Client Information");
  field("Client", input.clientName);
  field("Address", input.clientAddress);
  t += many ? 1 : 2;
  heading("Sample/Product Information");
  field("Product/ Sample", input.sampleDescription);
  field("Brand Name", input.brandName);
  field("Manufacturer", input.manufacturer);
  field("Batch No.", input.lotNo);
  field("Best Before", input.bestBefore);
  field("Net Weight", input.sizeQuantity);
  field("Sample History", input.history);
  field("Date Sampled", input.dateSampled);
  field("Date Collected", input.dateCollected);
  t += many ? 1 : 2;
  heading("Service Provided");
  field("Date(s) of Analysis", input.dateOfAnalysis);
  field("Analysis Performed", input.analysisPerformed);
  field("Place of Analysis", input.placeOfAnalysis);
  field("Procedure used", input.procedures);
  field("Standard used", input.standard);

  const WARRANTY_H = 64;
  const SIGNATURE_H = 66;
  const PAGE_GAP = 10;
  const CONDITIONS_H = 48;
  const GAP_BEFORE_SIG = 28;
  const TABLE_HEADER_H = 32;
  const warrantyTop = FRAME.bottom - WARRANTY_H;
  const tableTop = t + 2;
  const tableLeft = COLUMNS[0];
  const tableRight = COLUMNS[COLUMNS.length - 1];
  const headerBottom = tableTop + 10;
  const columnsBottom = tableTop + TABLE_HEADER_H;
  const maxTableBottom = warrantyTop - PAGE_GAP - SIGNATURE_H - GAP_BEFORE_SIG - CONDITIONS_H;
  const rowCount = Math.max(input.rows.length, 1);
  const rowHeight = Math.max(many ? 9 : 12, Math.min(15, (maxTableBottom - columnsBottom) / rowCount));
  const rowSize = rowHeight < 12 ? 6.6 : 7.5;
  const tableBottom = columnsBottom + rowHeight * rowCount;

  pen.fill(tableLeft, tableTop, tableRight, columnsBottom, GRAY);
  pen.rect(tableLeft, tableTop, tableRight, tableBottom);
  pen.hline(tableLeft, tableRight, headerBottom);
  pen.hline(tableLeft, tableRight, columnsBottom);
  pen.centred("RESULTS", (tableLeft + tableRight) / 2, tableTop + 7.5, fonts.bold, 7.5);
  for (const x of COLUMNS.slice(1, -1)) pen.vline(x, headerBottom, tableBottom);
  const headers = ["Analysis Conducted", "Requirements of Standard", "Actual", "Uncertainty (k=2)", "Comments"];
  headers.forEach((label, index) => {
    const left = COLUMNS[index];
    const right = COLUMNS[index + 1];
    const size = index === 3 ? 6.6 : 7.5;
    const lines = wrap(label, fonts.bold, size, right - left - 8);
    const firstBaseline = headerBottom + 10.5 + (lines.length === 1 ? 2.5 : -2.5);
    lines.forEach((line, lineIndex) => pen.centred(line, (left + right) / 2, firstBaseline + lineIndex * 8.5, fonts.bold, size));
  });
  input.rows.forEach((row, rowIndex) => {
    const top = columnsBottom + rowIndex * rowHeight;
    if (rowIndex > 0) pen.hline(tableLeft, tableRight, top);
    const cells = [row.analysis, row.requirement, row.actual, row.uncertainty, row.comments].map((value) => (value === "—" ? "-" : value));
    cells.forEach((value, index) => {
      const left = COLUMNS[index];
      const right = COLUMNS[index + 1];
      const face = index === 4 && value.toUpperCase() === "FAIL" ? fonts.bold : fonts.regular;
      const text = fit(value, face, rowSize, right - left - 6);
      pen.centred(text, (left + right) / 2, top + rowHeight / 2 + rowSize * 0.35, face, rowSize);
    });
  });

  t = tableBottom + 12;
  pen.text("Uncertainty", LABEL_X, t, fonts.bold, 7.5);
  const uncertaintyLines = wrap(input.uncertaintyStatement, fonts.regular, 7.5, CONTENT_RIGHT - VALUE_X);
  uncertaintyLines.forEach((line, index) => pen.text(line, VALUE_X, t + index * 9, fonts.regular, 7.5));
  t += Math.max(22, uncertaintyLines.length * 9 + 6);
  pen.text("Laboratory Conditions", LABEL_X, t, fonts.bold, 7.5);
  t += 12;
  pen.text("Temperature (°C)", LABEL_X + 4, t, fonts.regular, 7.5);
  pen.text(input.temperature, VALUE_X, t, fonts.regular, 7.5);
  pen.text("Humidity (%)", 306, t, fonts.regular, 7.5);
  pen.text(input.humidity, 362, t, fonts.regular, 7.5);
  if (input.supersedes) {
    t += 12;
    pen.text(`This certificate supersedes ${input.supersedes}, which remains on record.`, LABEL_X + 4, t, fonts.italic, 7);
  }

  const signatureBottom = warrantyTop - PAGE_GAP;
  const signatureTop = signatureBottom - SIGNATURE_H;
  pen.rect(SIGNATURE_COLUMNS[0], signatureTop, SIGNATURE_COLUMNS[3], signatureBottom);
  pen.hline(SIGNATURE_COLUMNS[0], SIGNATURE_COLUMNS[3], signatureTop + 11);
  pen.vline(SIGNATURE_COLUMNS[1], signatureTop, signatureBottom);
  pen.vline(SIGNATURE_COLUMNS[2], signatureTop, signatureBottom);
  const middle = (index: number) => (SIGNATURE_COLUMNS[index] + SIGNATURE_COLUMNS[index + 1]) / 2;
  pen.centred("Analysis performed by", middle(0), signatureTop + 8, fonts.bold, 7.5);
  pen.centred("Approved by", middle(1), signatureTop + 8, fonts.bold, 7.5);
  pen.centred("Date of Issue", middle(2), signatureTop + 8, fonts.bold, 7.5);
  pen.hline(middle(0) - 58, middle(0) + 58, signatureTop + 38);
  pen.hline(middle(1) - 52, middle(1) + 52, signatureTop + 38);
  pen.centred(fit(input.performedBy, fonts.regular, 7.5, 160), middle(0), signatureTop + 48, fonts.regular, 7.5);
  pen.centred(fit(input.performedRole, fonts.regular, 7, 160), middle(0), signatureTop + 58, fonts.regular, 7);
  pen.centred(fit(input.approvedBy, fonts.regular, 7.5, 150), middle(1), signatureTop + 48, fonts.regular, 7.5);
  pen.centred(fit(input.approvedRole, fonts.regular, 7, 150), middle(1), signatureTop + 58, fonts.regular, 7);
  pen.centred(input.issuedAt, middle(2), signatureTop + 40, fonts.regular, 10);

  const pageLabel = "Page 1 of 1";
  pen.text(pageLabel, CONTENT_RIGHT - fonts.italic.widthOfTextAtSize(pageLabel, 7.5), signatureBottom + 8, fonts.italic, 7.5);

  pen.hline(FRAME.band, FRAME.right, warrantyTop);
  wrap(input.warranty, fonts.regular, 6.4, FRAME.right - FRAME.band - 8).forEach((line, index) => {
    pen.text(line, FRAME.band + 4, warrantyTop + 8 + index * 7.4, fonts.regular, 6.4);
  });

  pen.text(`Form No.: ${input.formNo}`, FRAME.left, 704, fonts.regular, 7);
  pen.text(`Version No.: ${input.version}`, FRAME.left, 716, fonts.regular, 7);
  pen.centred('"End of Report"', 309, 716, fonts.bold, 7.5);
  pen.text(`Date Issued: ${input.formDate}`, 454, 704, fonts.regular, 7);
  pen.text("Issued by Quality Manager", 454, 716, fonts.regular, 7);

  if (options.draft) drawDraftMark(page, fonts.bold);

  return Buffer.from(await pdf.save());
}

/** Vertical outlined title in the left band, reading bottom to top as on the template. */
function drawSpineTitle(page: PDFPage, title: string, font: PDFFont) {
  const bandWidth = FRAME.band - FRAME.left;
  const length = FRAME.bottom - FRAME.top - 40;
  const size = Math.min(38, length / font.widthOfTextAtSize(title, 1));
  const width = font.widthOfTextAtSize(title, size);
  const x = FRAME.band - 12;
  const y = PAGE[1] - FRAME.bottom + (FRAME.bottom - FRAME.top - width) / 2;
  page.pushOperators(
    pushGraphicsState(),
    rectangle(FRAME.left + 1.5, PAGE[1] - FRAME.bottom + 2, bandWidth - 3, FRAME.bottom - FRAME.top - 4),
    clip(),
    endPath(),
    setTextRenderingMode(TextRenderingMode.FillAndOutline),
    setStrokingRgbColor(0.1, 0.1, 0.1),
    setLineWidth(0.75),
  );
  page.drawText(title, { x, y, size, font, rotate: degrees(90), color: rgb(1, 1, 1) });
  page.pushOperators(popGraphicsState());
}

function drawDraftMark(page: PDFPage, font: PDFFont) {
  const text = "DRAFT - NOT ISSUED";
  const size = 44;
  const width = font.widthOfTextAtSize(text, size);
  const angle = 35;
  const radians = (angle * Math.PI) / 180;
  page.drawText(text, {
    x: (FRAME.band + FRAME.right) / 2 - (Math.cos(radians) * width) / 2,
    y: PAGE[1] / 2 - (Math.sin(radians) * width) / 2 - 20,
    size,
    font,
    rotate: degrees(angle),
    color: rgb(0.8, 0.1, 0.1),
    opacity: 0.16,
  });
}

/** Draws in template coordinates: x from the left edge, t measured down from the top of the page. */
class Pen {
  constructor(private page: PDFPage) {}

  text(value: string, x: number, t: number, font: PDFFont, size: number) {
    this.page.drawText(printable(value), { x, y: PAGE[1] - t, size, font, color: INK });
  }

  centred(value: string, centre: number, t: number, font: PDFFont, size: number) {
    const text = printable(value);
    this.page.drawText(text, { x: centre - font.widthOfTextAtSize(text, size) / 2, y: PAGE[1] - t, size, font, color: INK });
  }

  hline(x1: number, x2: number, t: number) {
    this.page.drawLine({ start: { x: x1, y: PAGE[1] - t }, end: { x: x2, y: PAGE[1] - t }, thickness: 0.8, color: LINE });
  }

  vline(x: number, t1: number, t2: number) {
    this.page.drawLine({ start: { x, y: PAGE[1] - t1 }, end: { x, y: PAGE[1] - t2 }, thickness: 0.8, color: LINE });
  }

  fill(x1: number, t1: number, x2: number, t2: number, color: ReturnType<typeof rgb>) {
    this.page.drawRectangle({ x: x1, y: PAGE[1] - t2, width: x2 - x1, height: t2 - t1, color });
  }

  rect(x1: number, t1: number, x2: number, t2: number) {
    this.page.drawRectangle({ x: x1, y: PAGE[1] - t2, width: x2 - x1, height: t2 - t1, borderColor: LINE, borderWidth: 0.8 });
  }

  image(image: Parameters<PDFPage["drawImage"]>[0], x: number, t: number, width: number, height: number) {
    this.page.drawImage(image, { x, y: PAGE[1] - t - height, width, height });
  }
}

/** Standard PDF fonts only cover WinAnsi; map common symbols and drop anything else. */
function printable(value: string) {
  const mapped = value.replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/\u2009|\u00a0/g, " ");
  let out = "";
  for (const char of mapped) {
    const code = char.codePointAt(0) ?? 0;
    const ok = code === 10 || (code >= 32 && code < 127) || (code >= 160 && code <= 255) || WIN_ANSI_EXTRA.includes(char);
    out += ok ? char : "?";
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, max: number) {
  const words = printable(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function fit(text: string, font: PDFFont, size: number, max: number) {
  let value = printable(text);
  if (font.widthOfTextAtSize(value, size) <= max) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > max) value = value.slice(0, -1);
  return `${value.trimEnd()}…`;
}
