'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Bell, Check, ChevronRight, ChevronsUpDown, CircleHelp, GraduationCap, LayoutDashboard, Mail, Menu, MessagesSquare, Search, Settings, Users, UsersRound, Video, Wallet, Workflow } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Toaster } from '@/components/ui/sonner';
import { demoWorkspaces } from '@/lib/domain/tenancy';
import { fmt, plural, relTime } from '@/lib/hub/format';
import { HubProvider, useHub } from './state';
import { hiddenRoutes, navItems } from './data';
import { ThemeMenu } from './theme';
import { ShellContext } from './shell-context';
import { hubEvents } from './events';
import { usePref } from './prefs';
import { parseRoute } from './hash-route';
import { Avatar, Btn, IconBtn, Modal } from './ui';
import Dashboard from './dashboard';
import Contacts from './contacts';
import Campaigns from './campaigns';
import Courses from './courses';
import { Automations, Chatbot, Learning, Payments, SettingsPage, Webinars } from './modules';
import AIAgents from './ai-agents';
import { AIProvider } from './ai-state';
import './product.css';
import './theme-legacy.css';
import './shell.css';
import './modules.css';

const ICONS: Record<string, typeof Users> = { prehled: LayoutDashboard, kontakty: Users, kampane: Mail, automatizace: Workflow, platby: Wallet, kurzy: GraduationCap, komunita: UsersRound, webinare: Video, chatbot: MessagesSquare, nastaveni: Settings };
const GROUPS: [string, string[]][] = [['Pracovní prostor', ['prehled', 'kontakty', 'kampane', 'automatizace', 'platby']], ['Vzdělávání a komunita', ['kurzy', 'komunita', 'webinare', 'chatbot']]];
const LABEL = Object.fromEntries([...navItems, ...hiddenRoutes]) as Record<string, string>;
const SUB: Record<string, string> = { nova: 'Nová kampaň', sablony: 'Šablony', segmenty: 'Segmenty', pipeline: 'Pipeline', souhlasy: 'Souhlasy', import: 'Import', faktury: 'Faktury', predplatne: 'Předplatné', transakce: 'Transakce', odkazy: 'Platební odkazy', kupony: 'Kupóny', produkty: 'Digitální produkty', moderace: 'Moderace', profil: 'Můj profil', tym: 'Tým', domeny: 'E-mailové domény', integrace: 'Integrace', data: 'Data a obnova' };

function Navigation() {
  const { route, go, workspaceId, setWorkspace, data, profile, contacts } = useHub();
  const { setOpenMobile } = useSidebar();
  const current = parseRoute(route).parts[0] ?? 'prehled';
  const nav = (r: string) => { go(r); setOpenMobile(false); };
  const wsName = (id: string) => data.settings.find(s => s.workspaceId === id)?.name ?? demoWorkspaces.find(w => w.id === id)?.name ?? '';
  const wsKind = (id: string) => data.settings.find(s => s.workspaceId === id)?.kind ?? '';
  const item = (id: string) => { const I = ICONS[id]; return (
    <SidebarMenuItem key={id}>
      <SidebarMenuButton isActive={current === id} onClick={() => nav(id)}>
        <I /><span>{LABEL[id]}</span>{id === 'kontakty' && <span className="nav-count">{fmt(contacts.length)}</span>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  ); };
  return (
    <Sidebar className="hub-sidebar">
      <SidebarContent>
        <a href="#prehled" className="brand" aria-label="Softema Hub — přehled"><span className="brand-logo"><Workflow /></span>softema<span className="hub-word">hub</span></a>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="workspace-switch" aria-label={`Pracovní prostor: ${wsName(workspaceId)}. Změnit`}>
              <span className="workspace-icon">{wsName(workspaceId).slice(0, 1).toUpperCase()}</span>
              <span><strong>{wsName(workspaceId)}</strong><small>{wsKind(workspaceId)}</small></span>
              <ChevronsUpDown size={13} className="ml-auto muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Softema · pracovní prostory</DropdownMenuLabel>
            {demoWorkspaces.map(x => (
              <DropdownMenuItem key={x.id} onSelect={() => { setWorkspace(x.id); setOpenMobile(false); }}>
                <span className="workspace-icon">{wsName(x.id).slice(0, 1).toUpperCase()}</span>{wsName(x.id)}{x.id === workspaceId && <Check size={14} className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {GROUPS.map(([label, ids], k) => (
          <React.Fragment key={label}>
            {k > 0 && <div className="sidebar-divider" />}
            <div className="nav-section">{label}</div>
            <SidebarMenu className="hub-nav">{ids.map(item)}</SidebarMenu>
          </React.Fragment>
        ))}
        <div className="sidebar-bottom">
          <SidebarMenu className="hub-nav">{item('nastaveni')}</SidebarMenu>
          <Link href="/" className="hub-website-link"><ArrowUpRight size={14} />Zpět na web Softema Hub</Link>
          <button type="button" className="profile" onClick={() => nav('nastaveni/profil')}>
            <Avatar name={profile.name} color={profile.color} />
            <span><strong>{profile.name}</strong><small>{profile.title}</small></span>
            <ChevronsUpDown size={13} className="ml-auto muted" />
          </button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

// Phone navigation: the four most used modules plus "Více", which opens the full sidebar sheet.
const MOBILE_TABS = ['prehled', 'kontakty', 'kampane', 'automatizace'];
function MobileTabs() {
  const { route, go } = useHub();
  const { openMobile, setOpenMobile } = useSidebar();
  const current = parseRoute(route).parts[0] ?? 'prehled';
  return (
    <nav className="mobile-tabs" aria-label="Hlavní moduly">
      {MOBILE_TABS.map(id => { const I = ICONS[id]; return <button key={id} type="button" aria-current={current === id ? 'page' : undefined} onClick={() => go(id)}><I aria-hidden /><span>{LABEL[id]}</span></button>; })}
      <button type="button" aria-label="Více – otevřít navigaci" aria-expanded={openMobile} onClick={() => setOpenMobile(true)}><Menu aria-hidden /><span>Více</span></button>
    </nav>
  );
}

const UNREAD_WINDOW = 3 * 86_400_000;
function Notifications({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { go, data, workspaceId } = useHub();
  const [read, setRead] = usePref<string[]>(`notifications-read:${workspaceId}`, []);
  const [now] = useState(() => Date.now());
  const events = useMemo(() => hubEvents(data, workspaceId, now), [data, workspaceId, now]);
  const isUnread = (id: string, date: string) => !read.includes(id) && now - +new Date(date) < UNREAD_WINDOW;
  const unread = events.filter(e => isUnread(e.id, e.date)).length;
  const label = (n: number) => plural(n, 'nepřečtené', 'nepřečtená', 'nepřečtených');
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className="icon-btn notif-trigger" aria-label={unread ? `Oznámení, ${label(unread)}` : 'Oznámení'}><Bell aria-hidden />{unread > 0 && <i className="notification-dot" aria-hidden />}</button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} collisionPadding={8} className="notif-panel" aria-label="Oznámení">
        <header className="notif-head">
          <div><h2>Oznámení</h2><p>{unread ? label(unread) : 'Vše přečteno'}</p></div>
          <button type="button" onClick={() => setRead(events.map(e => e.id))} disabled={!unread}>Označit vše jako přečtené</button>
        </header>
        {events.length ? (
          <ul className="notif-list">
            {events.map(e => { const I = e.icon; const unreadItem = isUnread(e.id, e.date); return (
              <li key={e.id}>
                <button type="button" className={'notif-item' + (unreadItem ? ' unread' : '')} onClick={() => { if (!read.includes(e.id)) setRead([...read, e.id]); onOpenChange(false); go(e.to); }}>
                  <span className="notif-icon"><I size={16} aria-hidden /></span>
                  <span><span className="notif-title">{unreadItem && <span className="sr-only">Nepřečteno: </span>}{e.who && <b>{e.who} </b>}{e.what}</span><span className="notif-desc">{e.desc}</span></span>
                  <span className="notif-time">{relTime(e.date)}</span>
                </button>
              </li>
            ); })}
          </ul>
        ) : <p className="notif-foot">Zatím žádná oznámení.</p>}
        <p className="notif-foot">Oznámení vznikají z dat v tomto prohlížeči; nic se neodesílá.</p>
      </PopoverContent>
    </Popover>
  );
}

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { go, w } = useHub();
  const pickRoute = (r: string) => { go(r); onClose(); };
  return (
    <Modal open={open} onClose={onClose} title="Co hledáte?" desc="Kontakty, kampaně, kurzy, webináře a moduly v aktuálním pracovním prostoru.">
      <Command>
        <CommandInput placeholder="Napište jméno, kampaň nebo modul…" />
        <CommandList>
          <CommandEmpty>Žádné výsledky.</CommandEmpty>
          <CommandGroup heading="Kontakty">{w.contacts.map(c => <CommandItem key={c.id} value={`kontakt ${c.name} ${c.email} ${c.company}`} onSelect={() => pickRoute('kontakty/' + c.id)}><Avatar name={c.name} color={c.color} size="sm" />{c.name}<span className="muted small ml-auto">{c.company || c.email}</span></CommandItem>)}</CommandGroup>
          <CommandGroup heading="Kampaně">{w.campaigns.map(c => <CommandItem key={c.id} value={`kampaň ${c.name}`} onSelect={() => pickRoute('kampane/' + c.id)}><Mail size={15} />{c.name}<span className="muted small ml-auto">{c.status}</span></CommandItem>)}</CommandGroup>
          <CommandGroup heading="Kurzy a webináře">{w.courses.map(c => <CommandItem key={c.id} value={`kurz ${c.title}`} onSelect={() => pickRoute('kurzy/' + c.id)}><GraduationCap size={15} />{c.title}</CommandItem>)}{w.webinars.map(x => <CommandItem key={x.id} value={`webinář ${x.title}`} onSelect={() => pickRoute('webinare/' + x.id)}><Video size={15} />{x.title}</CommandItem>)}</CommandGroup>
          <CommandGroup heading="Moduly">{navItems.map(([r, l]) => <CommandItem key={r} value={`modul ${l}`} onSelect={() => pickRoute(r)}>{l}</CommandItem>)}</CommandGroup>
        </CommandList>
      </Command>
    </Modal>
  );
}

function NotFound() {
  const { go } = useHub();
  return <div className="page"><section className="panel empty"><h3>Stránka nenalezena</h3><p>Odkaz je neplatný nebo záznam v tomto pracovním prostoru neexistuje.</p><Btn primary onClick={() => go('prehled')}>Zpět na přehled</Btn></section></div>;
}

function Loading() {
  return <div className="page" aria-busy="true" aria-live="polite"><div className="hub-loading"><span className="sr-only">Načítám data uložená v tomto prohlížeči…</span><i /><i /><i /></div></div>;
}

function Screen() {
  const { route, ready } = useHub();
  if (!ready) return <Loading />;
  const mod = parseRoute(route).parts[0] ?? 'prehled';
  switch (mod) {
    case 'prehled': return <Dashboard />;
    case 'kontakty': return <Contacts />;
    case 'kampane': return <Campaigns />;
    case 'automatizace': return <Automations />;
    case 'platby': return <Payments />;
    case 'kurzy': return <Courses />;
    case 'komunita': return <Learning />;
    case 'webinare': return <Webinars />;
    case 'chatbot': return <Chatbot />;
    case 'nastaveni': return <SettingsPage />;
    case 'ai-agenti': return <AIAgents />;
    default: return <NotFound />;
  }
}

function Frame() {
  const { route, go, workspace, workspaceId, profile } = useHub();
  const [search, setSearch] = useState(false);
  const [notice, setNotice] = useState(false);
  const [help, setHelp] = useState(false);
  const { parts } = parseRoute(route);
  const mod = parts[0] ?? 'prehled';
  const sub = parts[1];
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(s => !s); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <ShellContext.Provider value={{ openNotifications: () => setNotice(true) }}>
      <SidebarProvider style={{ '--sidebar-width': '240px' } as React.CSSProperties}>
        <Navigation />
        <main className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button type="button" className="topbar-home" onClick={() => go('prehled')} aria-label="Přehled"><Workflow aria-hidden /></button>
              <span className="workspace-crumb">{workspace}</span><ChevronRight size={13} className="workspace-crumb" />
              <span>{LABEL[mod] ?? 'Přehled'}</span>
              {sub && <><ChevronRight size={13} /><span>{SUB[sub] ?? 'Detail'}</span></>}
            </div>
            <div className="topbar-right">
              <button type="button" className="global-search" onClick={() => setSearch(true)} aria-label="Hledat v aplikaci" aria-keyshortcuts="Control+K Meta+K"><Search size={16} aria-hidden /><span>Hledat kontakty, kampaně…</span><kbd>Ctrl K</kbd></button>
              <IconBtn label="Nápověda" onClick={() => setHelp(true)}><CircleHelp /></IconBtn>
              <ThemeMenu />
              <Notifications open={notice} onOpenChange={setNotice} />
              <button type="button" className="topbar-profile" onClick={() => go('nastaveni/profil')} aria-label="Můj profil"><Avatar name={profile.name} color={profile.color} size="sm" /></button>
            </div>
          </header>
          <div key={workspaceId}><Screen /></div>
        </main>
        <MobileTabs />
        <SearchDialog open={search} onClose={() => setSearch(false)} />
        <Modal open={help} onClose={() => setHelp(false)} title="Vítejte v Softema Hub" desc="Kontakty, kampaně, vzdělávání a komunita na jednom místě.">
          <div className="stack">
            <p>Moduly najdete v levé navigaci, na telefonu ve spodní liště. Vyhledávání otevřete zkratkou Ctrl K.</p>
            <div className="preview-notice">Toto je frontendový prototyp s ukázkovými daty. Změny se ukládají jen v tomto prohlížeči; e-maily, platby ani registrace se skutečně neodesílají. Ukázková data obnovíte v Nastavení → Data a obnova.</div>
            <Btn primary onClick={() => { go('kampane/nova'); setHelp(false); }}>Vyzkoušet novou kampaň<ChevronRight /></Btn>
          </div>
        </Modal>
        <Toaster position="bottom-right" richColors closeButton mobileOffset={{ bottom: 84 }} />
      </SidebarProvider>
    </ShellContext.Provider>
  );
}

export default function Hub() { return <HubProvider><AIProvider><Frame /></AIProvider></HubProvider>; }
