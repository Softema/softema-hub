/** Czech formatting helpers (Europe/Prague, cs-CZ). Non-breaking spaces keep numbers, units and dates together. */
export const TZ = 'Europe/Prague';
export const NB = ' ';

const nf = new Intl.NumberFormat('cs-CZ');
export const fmt = (v: number) => nf.format(v);
export const money = (v: number) => `${fmt(Math.round(v))}${NB}Kč`;
export const percent = (v: number, digits = 1) => `${new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)}${NB}%`;
export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const parts = (iso: string) => {
  const p = new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return { d: g('day'), m: g('month'), y: g('year'), h: g('hour'), min: g('minute') };
};
export const fmtDate = (iso: string) => { const { d, m, y } = parts(iso); return `${d}.${NB}${m}.${NB}${y}`; };
export const fmtShortDate = (iso: string) => { const { d, m } = parts(iso); return `${d}.${NB}${m}.`; };
export const fmtTime = (iso: string) => { const { h, min } = parts(iso); return `${Number(h)}:${min}`; };
export const fmtDateTime = (iso: string) => `${fmtDate(iso)} · ${fmtTime(iso)}`;
/** Date for <input type="date"> / time for <input type="time"> in Prague time. */
export const toDateInput = (iso: string) => { const { d, m, y } = parts(iso); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; };
export const toTimeInput = (iso: string) => { const { h, min } = parts(iso); return `${h.padStart(2, '0')}:${min}`; };
/** Builds an ISO instant from Prague-local date + time inputs (handles summer/winter time). */
export function fromPragueInput(date: string, time: string) {
  const guess = new Date(`${date}T${time || '00:00'}:00Z`);
  const shown = parts(guess.toISOString());
  const shownUtc = Date.UTC(Number(shown.y), Number(shown.m) - 1, Number(shown.d), Number(shown.h), Number(shown.min));
  return new Date(guess.getTime() - (shownUtc - guess.getTime())).toISOString();
}
export const DAY = 86_400_000;
export const daysSince = (iso: string, now = Date.now()) => Math.floor((now - new Date(iso).getTime()) / DAY);
/** Start of "the last N days" including today (local midnight), shared by the dashboard and list filters. */
export const periodStart = (days: number, now = Date.now()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return +d + DAY - days * DAY; };

export function relTime(iso: string, now = Date.now()) {
  const diff = now - new Date(iso).getTime();
  const future = diff < 0; const a = Math.abs(diff);
  const min = Math.round(a / 60_000), h = Math.round(a / 3_600_000), d = Math.round(a / DAY);
  const v = min < 1 ? 'teď' : min < 60 ? `${min} min` : h < 24 ? `${h} h` : d < 7 ? `${d} ${d === 1 ? 'den' : d < 5 ? 'dny' : 'dní'}` : fmtDate(iso);
  if (v === 'teď' || d >= 7) return v;
  return future ? `za ${v}` : `před ${v}`;
}

const pr = new Intl.PluralRules('cs');
/** Czech plural: plural(5, 'kontakt', 'kontakty', 'kontaktů') → "5 kontaktů" */
export function plural(n: number, one: string, few: string, many: string, withNumber = true) {
  const c = pr.select(n); const w = c === 'one' ? one : c === 'few' ? few : many;
  return withNumber ? `${fmt(n)}${NB}${w}` : w;
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const slugify = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
