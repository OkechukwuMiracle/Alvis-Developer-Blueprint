import "server-only";
import nodemailer from "nodemailer";
export async function deliverInvitation(
  email: string,
  url: string,
  organization: string,
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
    return "manual" as const;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === "465",
    requireTLS: process.env.SMTP_REQUIRE_TLS !== "false",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Your Alvis workspace invitation",
      text: `You have been invited to ${organization} on Alvis.\n\nOpen this invitation in your browser: ${url}\n\nSign in or register, verify this email address, then accept. This invitation expires in seven days and can be used once. If you were not expecting it, ignore it.`,
    });
    return "sent" as const;
  } catch {
    return "failed" as const;
  } finally {
    transport.close();
  }
}
