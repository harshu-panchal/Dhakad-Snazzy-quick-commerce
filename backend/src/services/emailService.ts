import nodemailer, { Transporter } from "nodemailer";

/**
 * Transactional email. Provider-agnostic SMTP via nodemailer, so it works with
 * whatever mailbox already exists for the dhakadsnazzy.com domain.
 *
 * Required env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * Optional:
 *   SMTP_SECURE ("true" for implicit TLS on 465), SMTP_FROM, ADMIN_PANEL_URL
 */

let transporter: Transporter | null = null;
let configWarningLogged = false;

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS,
  );
}

function getTransporter(): Transporter | null {
  if (!isEmailConfigured()) {
    if (!configWarningLogged) {
      console.warn(
        "[email] SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS). Password reset emails cannot be sent.",
      );
      configWarningLogged = true;
    }
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

/**
 * Checked once at startup so a misconfiguration surfaces at deploy time rather
 * than when somebody needs a password reset. Never throws and never blocks
 * startup.
 */
export async function verifyEmailTransport(): Promise<boolean> {
  const tx = getTransporter();
  if (!tx) return false;

  try {
    await tx.verify();
    console.log("[email] SMTP transport verified");
    return true;
  } catch (error: any) {
    console.error(
      `[email] SMTP verification FAILED: ${error?.message}. Password reset emails will not be delivered.`,
    );
    return false;
  }
}

export interface SendMailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Returns true when the message was handed to the SMTP server. */
export async function sendMail({ to, subject, html, text }: SendMailArgs): Promise<boolean> {
  const tx = getTransporter();
  if (!tx) return false;

  try {
    await tx.sendMail({
      from:
        process.env.SMTP_FROM ||
        `Dhakad Snazzy <no-reply@${(process.env.SMTP_HOST || "dhakadsnazzy.com").replace(/^smtp\./, "")}>`,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (error: any) {
    console.error(`[email] send failed to ${to}: ${error?.message}`);
    return false;
  }
}

const panelUrl = (): string =>
  (process.env.ADMIN_PANEL_URL || "https://www.dhakadsnazzy.com").replace(/\/+$/, "");

export function adminResetPasswordUrl(token: string): string {
  return `${panelUrl()}/admin/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Admin password reset. The link is single-use and expires after
 * ADMIN_RESET_TOKEN_TTL_MINUTES (default 30).
 */
export async function sendAdminPasswordResetEmail(args: {
  to: string;
  firstName: string;
  token: string;
  expiresInMinutes: number;
}): Promise<boolean> {
  const url = adminResetPasswordUrl(args.token);
  const { firstName, expiresInMinutes } = args;

  const text = [
    `Hi ${firstName},`,
    "",
    "We received a request to reset the password for your Dhakad Snazzy admin account.",
    "",
    `Reset your password: ${url}`,
    "",
    `This link can be used once and expires in ${expiresInMinutes} minutes.`,
    "",
    "If you did not request this, you can ignore this email - your password has not changed.",
  ].join("\n");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827">
    <h2 style="margin:0 0 16px;font-size:20px;color:#0f766e">Reset your admin password</h2>
    <p style="margin:0 0 12px;line-height:1.6">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 20px;line-height:1.6">
      We received a request to reset the password for your Dhakad Snazzy admin account.
    </p>
    <p style="margin:0 0 24px">
      <a href="${url}"
         style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">
        Reset password
      </a>
    </p>
    <p style="margin:0 0 12px;line-height:1.6;color:#6b7280;font-size:14px">
      This link can be used once and expires in ${expiresInMinutes} minutes.
    </p>
    <p style="margin:0;line-height:1.6;color:#6b7280;font-size:14px">
      If you did not request this, you can ignore this email &mdash; your password has not changed.
    </p>
  </div>`.trim();

  return sendMail({
    to: args.to,
    subject: "Reset your Dhakad Snazzy admin password",
    text,
    html,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
