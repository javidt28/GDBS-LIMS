import { createHash } from "node:crypto";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;
const resend = apiKey ? new Resend(apiKey) : null;

export function emailConfigured() {
  return Boolean(resend && from);
}

export function appUrl(path: string) {
  const base =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return new URL(path, base).toString();
}

function escape(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function sendLinkEmail(input: { kind: "verify" | "reset"; to: string; link: string; token: string }) {
  if (!resend || !from) return false;
  const subject = input.kind === "verify" ? "Verify your GDBS client account" : "Reset your GDBS client password";
  const intro =
    input.kind === "verify"
      ? "Confirm your email address to finish creating your Grenada Bureau of Standards client account."
      : "Use this link to choose a new password for your Grenada Bureau of Standards client account. If you did not ask for this, ignore this email.";
  const action = input.kind === "verify" ? "Verify email" : "Reset password";
  const { error } = await resend.emails.send(
    {
      from,
      to: input.to,
      subject,
      text: `${intro}\n\n${action}: ${input.link}\n\nGrenada Bureau of Standards`,
      html: `<p>${escape(intro)}</p><p><a href="${escape(input.link)}">${action}</a></p><p>Grenada Bureau of Standards</p>`,
    },
    { idempotencyKey: `${input.kind}-${createHash("sha256").update(input.token).digest("hex").slice(0, 32)}` },
  );
  if (error) {
    console.error("Email send failed", error.name, error.message);
    return false;
  }
  return true;
}
