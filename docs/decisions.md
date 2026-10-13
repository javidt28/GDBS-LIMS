# Requirements decision log

Confirmed sources for this build are the seven controlled documents in `~/Downloads/Templates for LIMS` and the public pages of gdbs.gd. Nothing else is treated as a GDBS policy.

## Confirmed and implemented

- Service requests follow GDBS-QMF-004 v4, including the Simple Acceptance Decision Rule acknowledgement.
- Sample receipt follows GDBS-ANCF-001 v7. The printed analysis names are a selection list. Environmental ranges printed on that form produce a warning and do not block a save.
- Raw data follows GDBS-ANCF-010 v3: up to five readings, equipment tag, and the person who performed the work.
- Verification follows GDBS-QMF-024 v2. Checklist rows come from the analyses on the work order. The water-test names written on the supplied PDF are annotations, not printed fields.
- The person who submits the checklist cannot verify it, and the person who entered the results cannot verify or issue the report.
- Issued files use the section structure, requirement column, uncertainty statement, warranty, and form identifiers of GDBS-QMF-043 v03 or GDBS-QMF-044 v03. Example names and example results from those spreadsheets are not used.
- Where the water template’s results sheet and certificate sheet disagree, the certificate sheet is used.
- Job numbers follow the 2026 work-order log: date, lab code AL, MBL, or EA, and a daily sequence. Certificate numbers are the year, the lab code, and a running number. Materials and metrology codes are not in that log.
- Client-submitted samples are technical services work and can be shown to that client. Other origins are conformity assessment work and are not shown in the client portal.
- A corrected report keeps the original file. The new file says which certificate it supersedes. Reviewed results cannot be overwritten without a reason; the earlier value is kept.

## Not confirmed — left unset

- No fee, tax, quotation wording, invoice template, or bank account is in the seven documents. The fee schedule starts empty. A quotation line can only reference an administrator-approved fee. Acceptance terms must be saved before a quotation can be issued.
- A client payment reference is stored as `REFERENCE_SUBMITTED`. It becomes `CONFIRMED` only when a finance user records that decision.
- Card payments and credit accounts are not implemented. GDBS has not named a provider or a credit policy.
- Label certification at $15 per label is published on gdbs.gd. The application form is not in this document set, so the fee is not loaded and the service cannot be requested here.
- The public site uses gdbs@gdbs.gd and the telephones on the contact page. Issued PDFs keep gdbs@spiceisle.com and fax (473) 440-5554 because those are printed on the approved templates.
- No accreditation mark is placed on a report. The Bureau’s website describes an analytical chemistry accreditation; the schedule was not supplied.
- Transactional email is not connected. In development, the verification or reset link is shown after the request. In production the token is stored and no message is sent until a provider is configured.
- Uploaded files are stored on the application disk. Malware scanning is not configured.
- The administrator must set certificate sequences before production use so they do not collide with the paper log. The 2026 log is not imported.
- The visual system uses the published monochrome logo on a white page. It is provisional pending brand approval.
- Hosting for client.gdbs.gd and the DNS owner are undecided. Local PostgreSQL is started by the application for development and tests.

## Local operation

`npm run dev` starts PostgreSQL on port 54329, applies migrations, and serves the site at http://localhost:3000.

Create the first administrator with `STAFF_BOOTSTRAP_EMAIL`, `STAFF_BOOTSTRAP_PASSWORD`, and `STAFF_BOOTSTRAP_NAME`, then `npm run staff:create`. There is no public staff registration.
