// Generates app/theme-legacy.css: theme-aware overrides for the original (minified) app styles.
//
//   node scripts/build-theme-css.mjs        (pnpm theme:css)
//
// For every rule in the legacy stylesheets that sets a colour, it emits:
//  - an unprefixed override that maps neutral greys (text, surfaces, lines) to the shared
//    tokens from app/shell.css, and darkens saturated text that fails WCAG AA on white;
//  - a `:where(.dark)` override with dark variants of tinted backgrounds, borders and coloured text.
// Neutral tokens change value in the dark theme on their own, so they need no dark rule.
// Content with its own design (newsletter preview, template thumbnails, chatbot widget) is
// left untouched and kept light in the dark theme.
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCES = ['app/globals.css', 'app/product.css', 'app/ai-agents.css'];
const OUTPUT = 'app/theme-legacy.css';
const KEEP_LIGHT = /email-paper|email-block|email-cta|template-paper|template-lines|template-preview|mini-brand|mini-cta|chat-widget|chat-message|chat-input|bot-icon/;
const SKIP_SELECTOR = /^(:root|html|body|\*)(\b|$)|::-webkit|::selection/;

/* ---------- tiny CSS parser for flat/minified stylesheets ---------- */
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  function block() {
    const nodes = [];
    while (i < css.length) {
      let prelude = '';
      while (i < css.length && css[i] !== '{' && css[i] !== '}' && css[i] !== ';') {
        if (css[i] === '"' || css[i] === "'") { const q = css[i]; prelude += css[i++]; while (i < css.length && css[i] !== q) prelude += css[i++]; }
        prelude += css[i++];
      }
      if (i >= css.length) break;
      const ch = css[i++];
      if (ch === '}') return nodes;
      if (ch === ';') continue; // at-rule statement (@import, @custom-variant …)
      prelude = prelude.trim();
      if (/^@(media|supports)/.test(prelude)) nodes.push({ type: 'group', prelude, children: block() });
      else if (prelude.startsWith('@')) skip();
      else nodes.push({ type: 'rule', selector: prelude, body: body() });
    }
    return nodes;
  }
  function skip() { let depth = 1; while (i < css.length && depth) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; } }
  function body() { let s = '', depth = 0; while (i < css.length) { const c = css[i++]; if (c === '{') depth++; if (c === '}') { if (!depth) break; depth--; } s += c; } return s; }
  return block();
}
function declarations(body) {
  const out = []; let cur = '', depth = 0;
  for (const c of body) { if (c === '(') depth++; if (c === ')') depth--; if (c === ';' && !depth) { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur);
  return out.map(d => d.trim()).filter(Boolean).map(d => { const k = d.indexOf(':'); return [d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim()]; });
}

/* ---------- colour helpers ---------- */
const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/g;
function rgba(tok) {
  if (tok === 'white') return [255, 255, 255, 1];
  if (tok === 'black') return [0, 0, 0, 1];
  if (tok.startsWith('#')) {
    let h = tok.slice(1);
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = [0, 2, 4].map(o => parseInt(h.slice(o, o + 2), 16));
    return [...n, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  }
  const p = tok.match(/[\d.]+%?/g).map(Number.parseFloat);
  return [p[0], p[1], p[2], p[3] ?? 1];
}
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function hex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const chroma = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

/* ---------- mapping ---------- */
const GROUP = p =>
  p === 'color' || p === 'fill' ? 'text'
  : p.startsWith('background') ? 'bg'
  : p.startsWith('border') || p.startsWith('outline') || p === 'stroke' || p === 'column-rule' ? 'line'
  : p === 'box-shadow' || p === 'text-shadow' ? 'shadow' : null;

function mapColor(group, tok) {
  const c = rgba(tok); const L = lum(c); const [h, s, l] = hsl(c);
  // greys incl. bluish greys (#78808b); light tints such as #edf2ff or #fff0e9 have high HSL saturation
  const neutral = chroma(c) < 0.03 || (s < 0.25 && chroma(c) < 0.12);
  const res = { both: null, dark: null };
  if (c[3] < 0.5) return res; // translucent tints/shadows stay as they are
  if (neutral) {
    if (group === 'text') {
      if (L > 0.95) return res; // white text sits on coloured fills
      const cr = 1.05 / (L + 0.05);
      res.both = cr >= 10 ? 'var(--ink)' : cr >= 6.5 ? 'var(--ink-2)' : cr >= 2.4 ? 'var(--ink-3)' : 'var(--ink-4)';
    } else if (group === 'bg') {
      if (L >= 0.99) res.both = 'var(--surface)';
      else if (L >= 0.86) res.both = 'var(--surface-2)';
      else if (L >= 0.6) res.both = 'var(--surface-3)';
      else if (L < 0.2) res.dark = 'var(--surface-3)';
    } else if (group === 'line') {
      if (L >= 0.88) res.both = 'var(--line-soft)';
      else if (L >= 0.75) res.both = 'var(--line)';
      else if (L >= 0.5) res.both = 'var(--line-strong)';
    } else if (group === 'shadow' && L > 0.95) res.both = 'var(--surface)';
    return res;
  }
  if (group === 'text') {
    if (l < 0.62 && contrast(L, 1) < 4.5) { let ll = l; while (ll > 0.05 && contrast(lum(rgba(hex(h, s, ll))), 1) < 4.6) ll -= 0.01; res.both = hex(h, s, ll); }
    if (l < 0.62) res.dark = hex(h, Math.min(s, 0.75), 0.72);
  } else if (group === 'bg') {
    if (L >= 0.6) res.dark = hex(h, Math.max(0.15, Math.min(s * 0.5, 0.45)), 0.17);
  } else if (group === 'line') {
    if (L >= 0.5) res.dark = hex(h, Math.max(0.15, Math.min(s * 0.5, 0.4)), 0.3);
  }
  return res;
}

function convert(value, group, which) {
  let changed = false;
  const out = value.replace(COLOR, tok => { const m = mapColor(group, tok)[which]; if (m) { changed = true; return m; } return tok; });
  return changed ? out : null;
}

/* ---------- emit ---------- */
function emit(nodes, which) {
  let css = '';
  for (const n of nodes) {
    if (n.type === 'group') { const inner = emit(n.children, which); if (inner) css += `${n.prelude}{${inner}}\n`; continue; }
    const selectors = n.selector.split(/,(?![^(]*\))/).map(s => s.trim());
    if (selectors.some(s => SKIP_SELECTOR.test(s) || KEEP_LIGHT.test(s))) continue;
    const decls = [];
    for (const [prop, val] of declarations(n.body)) {
      const group = GROUP(prop); if (!group || /var\(/.test(val)) continue;
      const important = /!important$/.test(val);
      const v = convert(val.replace(/\s*!important$/, ''), group, which);
      if (v) decls.push(`${prop}:${v}${important ? '!important' : ''}`);
    }
    if (!decls.length) continue;
    const sel = which === 'dark' ? selectors.map(s => `:where(.dark) ${s}`).join(',') : selectors.join(',');
    css += `${sel}{${decls.join(';')}}\n`;
  }
  return css;
}

let both = '', dark = '';
for (const file of SOURCES) {
  const tree = parse(readFileSync(file, 'utf8'));
  both += `/* ${file} */\n${emit(tree, 'both')}`;
  dark += `/* ${file} */\n${emit(tree, 'dark')}`;
}
const keepLight = ':is(.email-paper,.template-paper,.chat-widget){color:#25292f}\n:where(.dark) :is(.email-paper,.template-paper,.chat-widget){color-scheme:light}\n';
writeFileSync(OUTPUT, `/* GENERATED by scripts/build-theme-css.mjs — do not edit by hand; change the sources or the generator.
   Theme-aware overrides for the original app styles (see the generator header for the rules). */

/* ===== Both themes: neutral colours → shared tokens, AA-safe text ===== */
${both}
/* ===== Dark theme: tinted surfaces, borders and coloured text ===== */
${dark}
/* Newsletter preview, template thumbnails and the chatbot widget keep their own (light) design. */
${keepLight}`);
console.log(`${OUTPUT}: ${(both.match(/\{/g) || []).length} + ${(dark.match(/\{/g) || []).length} rules`);
