import nodemailer from 'nodemailer';
import type { AppEnv } from './env';

interface MailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export class Mailer {
  private transport: nodemailer.Transporter | null = null;
  private from: string;

  constructor(env: AppEnv) {
    this.from = env.SMTP_FROM ?? `noreply@${env.APP_NAME}`;
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
      this.transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 465,
        secure: (env.SMTP_PORT ?? 465) === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD
        }
      });
    }
  }

  get isConfigured(): boolean {
    return this.transport !== null;
  }

  async send(payload: MailPayload): Promise<boolean> {
    if (!this.transport) {
      return false;
    }
    await this.transport.sendMail({
      from: this.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html
    });
    return true;
  }
}
