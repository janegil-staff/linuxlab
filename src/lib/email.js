// src/lib/email.js
// Minimal email sender. If SMTP_* env vars are set, sends via nodemailer;
// otherwise logs the message (dev/unconfigured) so flows still work locally.
//
// We keep this dependency-light: nodemailer is imported lazily so the app runs
// without it installed when email isn't configured.

const FROM = process.env.MAIL_FROM || "Linux Lab <no-reply@localhost>";
const APP_URL = process.env.APP_PUBLIC_URL || "http://localhost:3000";

export function verifyLink(token) {
  return `${APP_URL}/auth/verify?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(to, token) {
  const link = verifyLink(token);
  const subject = "Verify your Linux Lab account";
  const text = `Welcome to Linux Lab.\n\nVerify your account:\n${link}\n\nIf you didn't sign up, ignore this email.`;

  const host = process.env.SMTP_HOST;
  if (!host) {
    // Not configured — log it so dev/local flows can proceed.
    console.log(`[email:dev] to=${to} verify=${link}`);
    return { delivered: false, link };
  }

  // Lazy import so nodemailer is only needed when SMTP is configured.
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  await transport.sendMail({ from: FROM, to, subject, text });
  return { delivered: true };
}
