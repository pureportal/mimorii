import { Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class MailService {
  available(): boolean {
    return Boolean(process.env.MIMORII_SMTP_HOST && process.env.MIMORII_EMAIL_FROM);
  }

  async send(to: string | string[], subject: string, text: string): Promise<void> {
    const host = process.env.MIMORII_SMTP_HOST;
    const from = process.env.MIMORII_EMAIL_FROM;
    if (!host || !from) throw new Error("SMTP is not configured");
    const user = process.env.MIMORII_SMTP_USER;
    const password = process.env.MIMORII_SMTP_PASSWORD;
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.MIMORII_SMTP_PORT ?? 587),
      secure: process.env.MIMORII_SMTP_SECURE === "true",
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
    await transporter.sendMail({ from, to, subject, text });
  }
}
