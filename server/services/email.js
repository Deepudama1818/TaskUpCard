import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  try {
    const mail = {
      from: process.env.SMTP_FROM || 'TaskUpCard <no-reply@taskupcard.app>',
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, ''),
      html,
    };
    const info = await getTransporter().sendMail(mail);
    if (!process.env.SMTP_HOST) {
      console.log(`[Email] Dispatched (local transport) to=${to} subject="${subject}"`);
    }
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Send error:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function sendInvitationEmail({ to, name, inviteUrl, inviterName, roleLabel }) {
  return sendEmail({
    to,
    subject: `You're invited to collaborate on TaskUpCard`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <h2 style="margin: 0 0 12px;">Welcome to TaskUpCard, ${name}</h2>
        <p style="line-height: 1.6; color: #334155;">
          ${inviterName} has invited you to join TaskUpCard as a <strong>${roleLabel}</strong>.
          Activate your independent collaborator account to view your assigned tasks, deadlines, and deliverables.
        </p>
        <p style="margin: 24px 0;">
          <a href="${inviteUrl}" style="display: inline-block; padding: 12px 20px; background: #0f172a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Activate Account
          </a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Or copy this link: ${inviteUrl}</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  return sendEmail({
    to,
    subject: `Reset your TaskUpCard password`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <h2 style="margin: 0 0 12px;">Password Reset Request</h2>
        <p style="line-height: 1.6; color: #334155;">
          Hi ${name}, we received a request to reset your TaskUpCard password. Click the button below to choose a new password. This link expires in 1 hour.
        </p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 20px; background: #0f172a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Reset Password
          </a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Or copy this link: ${resetUrl}</p>
      </div>
    `,
  });
}

export async function sendVerificationEmail({ to, name, verifyUrl }) {
  return sendEmail({
    to,
    subject: `Verify your TaskUpCard email address`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <h2 style="margin: 0 0 12px;">Verify your email</h2>
        <p style="line-height: 1.6; color: #334155;">
          Hi ${name}, confirm your email address to complete your TaskUpCard account setup.
        </p>
        <p style="margin: 24px 0;">
          <a href="${verifyUrl}" style="display: inline-block; padding: 12px 20px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Verify Email
          </a>
        </p>
      </div>
    `,
  });
}
