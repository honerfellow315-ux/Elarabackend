import { env } from "../config/env.js";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

async function sendEmail({ to, subject, html }) {
  const res = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}): ${body}`);
  }
  return res.json();
}

function otpEmailHtml(code, heading) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="color:#0b2545;">${heading}</h2>
    <p style="color:#333; font-size:15px;">Use the verification code below. It expires in ${env.OTP_TTL_MINUTES} minutes.</p>
    <div style="font-size: 32px; letter-spacing: 8px; font-weight: bold; background:#f2f6fb; color:#0b2545; padding: 16px 24px; border-radius: 12px; text-align:center; margin: 20px 0;">
      ${code}
    </div>
    <p style="color:#888; font-size:13px;">If you did not request this, you can safely ignore this email.</p>
    <p style="color:#888; font-size:13px;">— ELARA WAVE</p>
  </div>`;
}

export async function sendOtpEmail(to, code, purpose) {
  const headings = {
    register: "Verify your ELARA WAVE account",
    password_reset: "Reset your ELARA WAVE password",
    password_change: "Confirm your password change",
  };
  return sendEmail({
    to,
    subject: "Your ELARA WAVE verification code",
    html: otpEmailHtml(code, headings[purpose] || "Your verification code"),
  });
}

export async function sendPasswordResetLinkEmail(to, resetUrl) {
  const html = `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="color:#0b2545;">Reset your password</h2>
    <p style="color:#333; font-size:15px;">Click the button below to set a new password. This link expires in 30 minutes.</p>
    <a href="${resetUrl}" style="display:inline-block; background:#0b2545; color:#fff; text-decoration:none; padding:12px 24px; border-radius:10px; font-weight:bold; margin: 16px 0;">Reset Password</a>
    <p style="color:#888; font-size:13px;">If you did not request this, you can safely ignore this email.</p>
    <p style="color:#888; font-size:13px;">— ELARA WAVE</p>
  </div>`;
  return sendEmail({ to, subject: "Reset your ELARA WAVE password", html });
}
