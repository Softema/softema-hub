'use client';
/* Shell of the database version. Same markup and styles as the demo shell; only modules connected to the API are shown. */
import React, { useState } from 'react';
import Link from 'next/link';
import { QueryClientProvider } from '@tanstack/react-query';
import { ArrowUpRight, Check, ChevronRight, ChevronsUpDown, LogOut, Menu, ShieldCheck, UserCog, Users, Workflow } from 'lucide-react';
import { ROLE_LABEL } from '@softema/shared';
import { Sidebar, SidebarContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/sonner';
import { Avatar, Btn } from '../ui';
import { ThemeMenu } from '../theme';
import { createQueryClient, signOut, useMe } from './api';
import { LoadFailure, LoadingBlock } from './live-ui';
import { LiveContacts } from './live-contacts';
import { LiveProvider, useLive, useLiveRoute } from './live-state';
import { ForcedTwoFactor, LiveSecurity } from './live-security';
import { LiveTeam } from './live-team';
import '../product.css';
import '../theme-legacy.css';
import '../shell.css';
import '../modules.css';

function Navigation() {
  const { me, workspace, setWorkspace, go, route } = useLive();
  const { setOpenMobile } = useSidebar();
  const icon = (name: string) => <span className="workspace-icon">{name.slice(0, 1).toUpperCase()}</span>;
  return (
    <Sidebar className="hub-sidebar">
      <SidebarContent>
        <a href="#kontakty" className="brand" aria-label="Softema Hub — kontakty"><span className="brand-logo"><Workflow /></span>softema <span className="hub-word">hub</span></a>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="workspace-switch">
              <span aria-hidden className="contents">{icon(workspace.name)}</span>
              <span><span className="sr-only">Pracovní prostor: </span><strong>{workspace.name}</strong><small>{ROLE_LABEL[workspace.role]}</small><span className="sr-only">. Změnit</span></span>
              <ChevronsUpDown size={13} className="ml-auto muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Vaše pracovní prostory</DropdownMenuLabel>
            {me.workspaces.map(w => <DropdownMenuItem key={w.id} onSelect={() => { setWorkspace(w.id); setOpenMobile(false); }}>{icon(w.name)}{w.name}{w.id === workspace.id && <Check size={14} className="ml-auto" />}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="nav-section">Pracovní prostor</div>
        <SidebarMenu className="hub-nav">
          <SidebarMenuItem><SidebarMenuButton isActive={route.startsWith('kontakty')} onClick={() => { go('kontakty'); setOpenMobile(false); }}><Users /><span>Kontakty</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton isActive={route.startsWith('tym')} onClick={() => { go('tym'); setOpenMobile(false); }}><UserCog /><span>Tým</span></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu>
        <div className="sidebar-bottom">
          <Link href="/" className="hub-website-link"><ArrowUpRight size={14} />Zpět na web Softema Hub</Link>
          <ProfileMenu className="profile" />
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

function ProfileMenu({ className }: { className: string }) {
  const { me, workspace, go } = useLive();
  const { setOpenMobile } = useSidebar();
  const [busy, setBusy] = useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={className} aria-label={`Účet ${me.user.name}`}>
          <Avatar name={me.user.name} />
          {className === 'profile' && <><span><strong>{me.user.name}</strong><small>{ROLE_LABEL[workspace.role]}</small></span><ChevronsUpDown size={13} className="ml-auto muted" /></>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>{me.user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { go('zabezpeceni'); setOpenMobile(false); }}><ShieldCheck aria-hidden />Zabezpečení účtu</DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={() => { setBusy(true); void signOut(); }}><LogOut aria-hidden />{busy ? 'Odhlašuji…' : 'Odhlásit se'}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileTabs() {
  const { go, route } = useLive();
  const { openMobile, setOpenMobile } = useSidebar();
  const current = (r: string) => (route.startsWith(r) ? 'page' as const : undefined);
  return (
    <nav className="mobile-tabs" aria-label="Hlavní moduly">
      <button type="button" aria-current={current('kontakty')} onClick={() => go('kontakty')}><Users aria-hidden /><span>Kontakty</span></button>
      <button type="button" aria-current={current('tym')} onClick={() => go('tym')}><UserCog aria-hidden /><span>Tým</span></button>
      <button type="button" aria-label="Více – otevřít navigaci" aria-expanded={openMobile} onClick={() => setOpenMobile(true)}><Menu aria-hidden /><span>Více</span></button>
    </nav>
  );
}

function Frame() {
  const { workspace, me } = useLive();
  const { parts, go } = useLiveRoute();
  const mod = parts[0];
  const title = mod === 'tym' ? 'Tým' : mod === 'zabezpeceni' ? 'Zabezpečení účtu' : 'Kontakty';
  return (
    <SidebarProvider style={{ '--sidebar-width': '240px' } as React.CSSProperties}>
      <Navigation />
      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button type="button" className="topbar-home" onClick={() => go('kontakty')} aria-label="Kontakty"><Workflow aria-hidden /></button>
            <span className="workspace-crumb">{workspace.name}</span><ChevronRight size={13} className="workspace-crumb" />
            <span>{title}</span>
            {mod === 'kontakty' && parts[1] && <><ChevronRight size={13} /><span>Detail</span></>}
          </div>
          <div className="topbar-right"><ThemeMenu /><ProfileMenu className="topbar-profile" /></div>
        </header>
        <div key={workspace.id}>
          {mod === 'kontakty' ? <LiveContacts /> : mod === 'tym' ? <LiveTeam /> : mod === 'zabezpeceni' ? <LiveSecurity enabled={me.user.twoFactorEnabled} required={me.user.twoFactorRequired} /> : <div className="page"><section className="panel empty"><h3>Tento modul zatím není napojený</h3><p>V databázové verzi jsou zatím dostupné kontakty a tým.</p><Btn primary onClick={() => go('kontakty')}>Přejít na kontakty</Btn></section></div>}
        </div>
      </main>
      <MobileTabs />
      <Toaster position="bottom-right" richColors closeButton mobileOffset={{ bottom: 84 }} />
    </SidebarProvider>
  );
}

/** Screens outside the app frame still need toasts (copying backup codes). */
const QueryShell = ({ children }: { children: React.ReactNode }) => <>{children}<Toaster position="bottom-right" richColors closeButton /></>;

function Session() {
  const me = useMe();
  if (me.isPending) return <div className="page" aria-busy="true"><LoadingBlock label="Ověřuji přihlášení…" /></div>;
  if (me.isError) return <div className="page"><LoadFailure error={me.error} onRetry={() => void me.refetch()} title="Aplikace se nepřipojila k serveru" /></div>;
  // An administrator without 2FA works with no data until it is on; the API enforces the same.
  if (me.data.user.twoFactorRequired && !me.data.user.twoFactorEnabled) return <QueryShell><ForcedTwoFactor name={me.data.user.name} /></QueryShell>;
  if (!me.data.workspaces.length) return <div className="page"><section className="panel empty"><h3>Nemáte přístup k žádnému prostoru</h3><p>Požádejte správce o pozvání do pracovního prostoru.</p><Btn onClick={() => void signOut()}>Odhlásit se</Btn></section></div>;
  return <LiveProvider me={me.data}><Frame /></LiveProvider>;
}

export default function LiveHub() {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}><Session /></QueryClientProvider>;
}
