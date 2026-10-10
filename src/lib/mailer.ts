import nodemailer from 'nodemailer';

interface MailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailerConfig {
  transport?: 'capture' | 'smtp';
  fromName?: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export class Mailer {
  private transport: ReturnType<typeof nodemailer.createTransport> | null = null;
  private from: string;
  private readonly fromName: string;
  private readonly capture: boolean;

  constructor(config?: MailerConfig | null) {
    this.from = config?.from ?? 'noreply@fd-core-stack.local';
    this.fromName = config?.fromName ?? 'Stack';
    this.capture = config?.transport === 'capture';
    if (!this.capture && config?.host) {
      this.transport = nodemailer.createTransport({
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 15000,
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user
          ? {
              user: config.user,
              pass: config.password,
            }
          : undefined,
      });
    }
  }

  get isConfigured(): boolean {
    return this.capture || this.transport !== null;
  }
  get isCapture(): boolean {
    return this.capture;
  }

  async verify() {
    if (!this.transport) throw new Error('请配置 SMTP 后再测试连接');
    try {
      await this.transport.verify();
    } finally {
      this.transport.close();
    }
  }

  async send(payload: MailPayload): Promise<boolean> {
    if (this.capture) return true;
    if (!this.transport) {
      return false;
    }
    try {
      await this.transport.sendMail({
        from: { address: this.from, name: this.fromName },
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
    } finally {
      this.transport.close();
    }
    return true;
  }
}
