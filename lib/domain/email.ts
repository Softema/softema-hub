export const EMAIL_PROVIDER = 'resend' as const;
export type EmailMessage = {
  from: string;
  to: string; // One recipient per job; never expose another client's mailing list.
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  unsubscribeUrl?: string;
  idempotencyKey: string;
};
export interface EmailSender {
  send(message: EmailMessage): Promise<{ provider: 'resend'; messageId: string; status: 'accepted' }>;
}
