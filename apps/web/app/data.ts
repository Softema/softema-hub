/** UI-level re-exports and navigation. Records live in the shared store (lib/hub). */
export type { Block, Campaign, Contact, CustomField } from '@/lib/hub/types';
export { defaultBlocks } from '@/lib/hub/seed';
export { fmt, money, normalize } from '@/lib/hub/format';

/** Modules shown in the navigation: [route, label]. */
export const navItems = [
  ['prehled', 'Přehled'], ['kontakty', 'Kontakty'], ['kampane', 'Kampaně'], ['automatizace', 'Automatizace'], ['platby', 'Platby'],
  ['kurzy', 'Kurzy a produkty'], ['komunita', 'Komunita'], ['webinare', 'Webináře'], ['chatbot', 'Chatbot'], ['nastaveni', 'Nastavení'],
] as const;
/** Hidden from navigation for the review (out of scope, zadání 1.2), still reachable by URL. */
export const hiddenRoutes = [['ai-agenti', 'AI agenti']] as const;
export const appRoutes: string[] = [...navItems, ...hiddenRoutes].map(n => n[0]);
