'use client';
/* Constants and the section header shared by the CRM screens. */
import React from 'react';
import type { ConsentState, Lifecycle } from '@/lib/hub/types';
import { useHub } from './state';
import { PageHead } from './ui';
import { SubNav } from './kit';

export const STAGES: Lifecycle[] = ['Lead', 'Zájemce', 'Klient'];
export const CONSENTS: ConsentState[] = ['Udělen', 'Čeká na potvrzení', 'Odvolán', 'Bez souhlasu'];
export const consentTone = (s: ConsentState) => (s === 'Udělen' ? 'green' : s === 'Odvolán' ? 'red' : s === 'Čeká na potvrzení' ? 'orange' : 'gray');
export const stageTone = (s: Lifecycle) => (s === 'Klient' ? 'green' : s === 'Zájemce' ? 'blue' : 'gray');

export function CrmHead({ active, title, desc, children }: { active: string; title: string; desc: string; children?: React.ReactNode }) {
  const { w } = useHub();
  const openDeals = w.deals.filter(d => d.stage !== 'Vyhráno' && d.stage !== 'Prohráno').length;
  const pending = w.contacts.filter(c => c.consent.state === 'Čeká na potvrzení').length;
  return (
    <>
      <PageHead title={title} desc={desc}>{children}</PageHead>
      <SubNav active={active} items={[['kontakty', 'Kontakty', w.contacts.length], ['kontakty/segmenty', 'Segmenty', w.segments.length], ['kontakty/pipeline', 'Pipeline', openDeals], ['kontakty/souhlasy', 'Souhlasy', pending || undefined]]} />
    </>
  );
}
