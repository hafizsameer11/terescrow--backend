import nodemailer from 'nodemailer';
import { prisma } from './prisma';
import tatumLogger from './tatum.logger';

async function createTransporter() {
  const smtpSettings = await prisma.smtp.findFirst();
  return nodemailer.createTransport({
    host: smtpSettings?.host || 'smtp.hostinger.com',
    port: smtpSettings?.port || 465,
    secure: true,
    auth: {
      user: smtpSettings?.email || process.env.GMAIL_USER,
      pass: smtpSettings?.password || process.env.GMAIL_PASS,
    },
  });
}

/** Best-effort system email — logs errors, does not throw. */
export async function sendSystemEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!to?.trim()) return false;
  try {
    const smtpSettings = await prisma.smtp.findFirst();
    const from = smtpSettings?.email || process.env.GMAIL_USER;
    if (!from) {
      tatumLogger.warn('sendSystemEmail skipped — no SMTP from address configured');
      return false;
    }
    const transporter = await createTransporter();
    await transporter.sendMail({ from, to, subject, html });
    return true;
  } catch (err) {
    tatumLogger.error('sendSystemEmail failed', { to, subject, err });
    return false;
  }
}
