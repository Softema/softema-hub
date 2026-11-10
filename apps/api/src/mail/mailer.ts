/**
 * Outgoing e-mail behind one interface (zadání: EmailProvider adapter). This stage never sends anything:
 * the local implementation writes each message as an HTML file into an outbox folder that is ignored by Git.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';

export interface MailMessage { to: string; subject: string; text: string; html: string }
export interface Mailer { send(message: MailMessage): Promise<void> }

export const DEFAULT_OUTBOX = resolve(import.meta.dirname, '../../../../.outbox');

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class OutboxMailer implements Mailer {
  private readonly log = new Logger('Mail');
  constructor(private readonly dir: string) {}
  async send(m: MailMessage) {
    await mkdir(this.dir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.html`;
    const page = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>${esc(m.subject)}</title></head><body style="margin:0;background:#f4f4f5">`
      + `<div style="font:13px system-ui,sans-serif;padding:12px 24px;background:#fff7ed;border-bottom:1px solid #fed7aa">Lokální schránka, e-mail nebyl odeslán. Komu: <b>${esc(m.to)}</b> · Předmět: <b>${esc(m.subject)}</b></div>`
      + `${m.html}</body></html>`;
    await writeFile(join(this.dir, name), page, { encoding: 'utf8', mode: 0o600 });
    // File name only: the address is personal data and the body contains a one-time link.
    this.log.log(`E-mail uložen do lokální schránky: .outbox/${name}`);
  }
}

/** Collects messages in memory, for tests. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(m: MailMessage) { this.sent.push(m); }
  last(to: string) { return [...this.sent].reverse().find(m => m.to === to); }
}

/** One simple, accessible template for all transactional e-mails. Every value is escaped. */
export function renderMail({ to, subject, lines, action, footer }: { to: string; subject: string; lines: string[]; action: { label: string; url: string }; footer: string }): MailMessage {
  const html = `<div style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border-radius:12px;font:15px/1.6 system-ui,sans-serif;color:#18181b">`
    + `<p style="margin:0 0 24px;font-weight:700;font-size:18px">softema <span style="color:#eb6536">hub</span></p>`
    + lines.map(l => `<p style="margin:0 0 16px">${esc(l)}</p>`).join('')
    + `<p style="margin:24px 0"><a href="${esc(action.url)}" style="display:inline-block;padding:12px 20px;background:#eb6536;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">${esc(action.label)}</a></p>`
    + `<p style="margin:0;color:#52525b;font-size:13px">${esc(footer)}</p></div>`;
  const text = `${lines.join('\n\n')}\n\n${action.label}: ${action.url}\n\n${footer}`;
  return { to, subject, text, html };
}
