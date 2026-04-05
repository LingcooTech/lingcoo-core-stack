import nodemailer from 'nodemailer';

interface MailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailerConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export class Mailer {
  private transport: nodemailer.Transporter | null = null;
  private from: string;

  constructor(config?: MailerConfig | null) {
    this.from = config?.from ?? 'noreply@fd-core-stack.local';
    if (config?.host && config.user && config.password) {
      this.transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.password
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
