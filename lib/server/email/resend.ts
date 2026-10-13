import type { EmailMessage, EmailSender } from '../../domain/email';

/** Server adapter prepared for the future worker. No UI or route calls this yet.
 * Pass secrets from the server runtime, never NEXT_PUBLIC_* or VITE_* variables.
 * Authorization, consent, sender-domain checks and the durable outbox belong
 * before this adapter. An accepted response does not mean delivered.
 */
export function createResendSender(config: { apiKey?: string; enabled?: boolean; fetcher?: typeof fetch }): EmailSender {
  if (typeof window !== 'undefined') throw new Error('Resend is server-only.');
  return {
    async send(message: EmailMessage) {
      if (config.enabled !== true) throw new Error('EMAIL_SENDING_DISABLED');
      if (!config.apiKey?.trim()) throw new Error('RESEND_API_KEY_MISSING');
      if (!message.idempotencyKey || message.idempotencyKey.length > 256 || /[\r\n]/.test(message.idempotencyKey)) throw new Error('INVALID_IDEMPOTENCY_KEY');
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(message.to)) throw new Error('ONE_VALID_RECIPIENT_REQUIRED');
      if (!message.subject.trim() || !message.from.trim() || /[\r\n]/.test(message.from)) throw new Error('EMAIL_FIELDS_MISSING');
      const headers: Record<string, string> = {};
      if (message.unsubscribeUrl) {
        const url = new URL(message.unsubscribeUrl);
        if (url.protocol !== 'https:') throw new Error('HTTPS_UNSUBSCRIBE_URL_REQUIRED');
        headers['List-Unsubscribe'] = `<${url.href}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }
      const response = await (config.fetcher || fetch)('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': message.idempotencyKey },
        body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, html: message.html, text: message.text, ...(message.replyTo ? { reply_to: message.replyTo } : {}), ...(Object.keys(headers).length ? { headers } : {}) }),
        signal: AbortSignal.timeout(15000),
      });
      // Do not log provider responses or credentials. Persist a sanitized error code.
      if (!response.ok) throw new Error(`RESEND_HTTP_${response.status}`);
      const body = await response.json() as { id?: unknown };
      if (typeof body.id !== 'string' || !body.id) throw new Error('RESEND_INVALID_RESPONSE');
      return { provider: 'resend' as const, messageId: body.id, status: 'accepted' as const };
    },
  };
}
