import { CalendarClock, GraduationCap, Mail, UserPlus, Wallet, type LucideIcon } from 'lucide-react';
import { money, type Campaign, type Contact } from './data';

/** Recent events of the workspace (mock). Shared by the dashboard activity and the notifications panel. */
export type HubEvent = { id: string; icon: LucideIcon; who: string; what: string; desc: string; time: string; full: string; to: string; unread: boolean };

export function hubEvents(contacts: Contact[], campaigns: Campaign[]): HubEvent[] {
  const sent = campaigns.find(c => c.status === 'Odesláno');
  const planned = campaigns.find(c => c.status === 'Naplánováno');
  const events: (HubEvent | false | undefined)[] = [
    contacts[0] && { id: 'payment', icon: Wallet, who: contacts[0].name, what: 'zaplatil fakturu', desc: `Marketingová konzultace · ${money(12900)}`, time: '12 min', full: 'před 12 minutami', to: 'kontakty/' + contacts[0].id, unread: true },
    contacts[2] && { id: 'new-contact', icon: UserPlus, who: contacts[2].name, what: 'je nový kontakt', desc: 'Registrace na webinář AI v marketingu', time: '34 min', full: 'před 34 minutami', to: 'kontakty/' + contacts[2].id, unread: true },
    planned && { id: 'planned', icon: CalendarClock, who: '', what: 'Kampaň je naplánovaná', desc: `${planned.name} · ${planned.date.replace(/(\d+)\. (\d+)\. /, '$1. $2. ')}`, time: '1 h', full: 'před 1 hodinou', to: 'kampane/' + planned.id, unread: false },
    contacts[1] && { id: 'lesson', icon: GraduationCap, who: contacts[1].name, what: 'dokončila lekci', desc: 'Marketing od základů · Lekce 4', time: '1 h', full: 'před 1 hodinou', to: 'kontakty/' + contacts[1].id, unread: false },
    sent && { id: 'open-rate', icon: Mail, who: '', what: `Kampaň má ${sent.open} otevření`, desc: sent.name, time: '2 h', full: 'před 2 hodinami', to: 'kampane/' + sent.id, unread: false },
  ];
  return events.filter((e): e is HubEvent => Boolean(e));
}
