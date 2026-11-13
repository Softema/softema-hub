'use client';
/* Team of the workspace: members, roles and pending invitations. Every change is confirmed by the server first. */
import React, { useState } from 'react';
import { MailPlus, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { type InvitationDto, type MemberDto, requiresTwoFactor, ROLE_LABEL, WORKSPACE_ROLES, type WorkspaceRole } from '@softema/shared';
import { fmtDate } from '@/lib/hub/format';
import { Avatar, Badge, Btn, Field, Modal, PageHead, Pick } from '../ui';
import { FormError, Notice, useConfirm } from '../kit-core';
import { ApiFailure, message, useInvitations, useMembers, useTeamMutations } from './api';
import { LoadFailure, LoadingBlock } from './live-ui';
import { useLive } from './live-state';
import './live-account.css';

const ROLES = WORKSPACE_ROLES.map(r => [r, ROLE_LABEL[r]] as [string, string]);
/** On this computer the API writes e-mails into the .outbox folder instead of sending them. */
const sentNote = (email: string) => /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
  ? `Pozvánka pro ${email} je připravená. V lokální verzi se e-mail neodesílá, najdete ho ve složce .outbox v projektu.`
  : `Pozvánka pro ${email} byla odeslána e-mailem.`;

export function LiveTeam() {
  const { workspace, me, allowed } = useLive();
  const manage = allowed('team:manage');
  const members = useMembers(workspace.id);
  const invitations = useInvitations(workspace.id, manage);
  const t = useTeamMutations(workspace.id);
  const [inviting, setInviting] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  const changeRole = (m: MemberDto, role: WorkspaceRole) => t.setRole.mutate({ userId: m.id, role }, {
    onSuccess: () => toast.success(`${m.name} má nyní roli ${ROLE_LABEL[role]}.`),
    onError: e => toast.error(message(e)),
  });
  const remove = (m: MemberDto) => confirm({
    title: `Odebrat ${m.name} z prostoru?`, desc: `Přístup k prostoru ${workspace.name} skončí okamžitě. Účet, kontakty i poznámky, které vytvořil, zůstanou.`, confirm: 'Odebrat z prostoru', danger: true,
    onConfirm: () => t.remove.mutate(m.id, { onSuccess: () => toast.success(`${m.name} už není členem prostoru.`), onError: e => toast.error(message(e)) }),
  });
  const revoke = (i: InvitationDto) => confirm({
    title: `Zrušit pozvánku pro ${i.email}?`, desc: 'Odkaz z e-mailu přestane platit.', confirm: 'Zrušit pozvánku', danger: true,
    onConfirm: () => t.revoke.mutate(i.id, { onSuccess: () => toast.success('Pozvánka byla zrušena.'), onError: e => toast.error(message(e)) }),
  });

  return (
    <div className="page">
      <PageHead title="Tým" desc={`Kdo má přístup k prostoru ${workspace.name}. ${manage ? 'Zvát a měnit role můžete jako správce.' : 'Tým spravují správci prostoru.'}`}>
        {manage && <Btn primary onClick={() => setInviting(true)}><UserPlus aria-hidden />Pozvat člena</Btn>}
      </PageHead>
      {workspace.role === 'agency_admin' && <Notice>Jako správce agentury máte přístup ke všem prostorům agentury, proto v seznamu členů nejste.</Notice>}
      {members.isPending ? <LoadingBlock label="Načítám tým…" />
        : !members.data ? <LoadFailure error={members.error} onRetry={() => void members.refetch()} />
        : (
          <section className="panel" aria-label="Členové prostoru" aria-busy={members.isFetching}>
            {!members.data.length ? (
              <div className="empty"><h3>V prostoru zatím nikdo není</h3><p>Pozvěte první členy týmu.</p>{manage && <Btn primary onClick={() => setInviting(true)}><UserPlus aria-hidden />Pozvat člena</Btn>}</div>
            ) : (
              <div className="table-scroll">
                <table className="hub-table data-table">
                  <thead><tr><th>Člen</th><th>Role</th><th className="col-opt">Dvoufázové ověření</th>{manage && <th><span className="sr-only">Akce</span></th>}</tr></thead>
                  <tbody>{members.data.map(m => {
                    const self = m.id === me.user.id;
                    const missing2fa = requiresTwoFactor(m.role) && !m.twoFactorEnabled;
                    return (
                      <tr key={m.id}>
                        <td><div className="name-cell"><Avatar name={m.name} /><span>{m.name}{self && <span className="muted"> (vy)</span>}<small>{m.email}</small></span></div></td>
                        <td>{manage && !self && m.role !== 'agency_admin'
                          ? <Pick label={`Role: ${m.name}`} className="team-role" value={m.role} onChange={r => { if (r !== m.role) changeRole(m, r as WorkspaceRole); }} options={ROLES} />
                          : <Badge tone={m.role === 'member' ? 'gray' : 'blue'}>{ROLE_LABEL[m.role]}</Badge>}</td>
                        <td className="col-opt"><Badge tone={m.twoFactorEnabled ? 'green' : missing2fa ? 'orange' : 'gray'}>{m.twoFactorEnabled ? 'Zapnuto' : missing2fa ? 'Chybí, nastaví při přihlášení' : 'Vypnuto'}</Badge></td>
                        {manage && <td className="col-go">{!self && <Btn className="danger-ghost" aria-label={`Odebrat ${m.name}`} disabled={t.remove.isPending} onClick={() => remove(m)}><Trash2 aria-hidden /></Btn>}</td>}
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </section>
        )}
      {manage && (
        <section className="panel" aria-labelledby="pending-title">
          <div className="card-head"><h2 id="pending-title">Čekající pozvánky</h2></div>
          {invitations.isPending ? <LoadingBlock label="Načítám pozvánky…" />
            : !invitations.data ? <LoadFailure error={invitations.error} onRetry={() => void invitations.refetch()} />
            : !invitations.data.length ? <div className="empty"><MailPlus size={28} aria-hidden /><h3>Žádné čekající pozvánky</h3><p>Pozvánka platí 7 dní. Po přijetí se člověk objeví v seznamu členů.</p></div>
            : (
              <div className="table-scroll">
                <table className="hub-table data-table team-pending">
                  <thead><tr><th>E-mail</th><th>Role</th><th className="col-opt">Pozval(a)</th><th className="col-opt">Platí do</th><th><span className="sr-only">Akce</span></th></tr></thead>
                  <tbody>{invitations.data.map(i => (
                    <tr key={i.id}>
                      <td>{i.email}</td>
                      <td><Badge tone={i.role === 'member' ? 'gray' : 'blue'}>{ROLE_LABEL[i.role]}</Badge></td>
                      <td className="col-opt">{i.invitedBy?.name ?? '—'}</td>
                      <td className="col-opt nowrap">{fmtDate(i.expiresAt)}</td>
                      <td className="col-go"><Btn aria-label={`Zrušit pozvánku pro ${i.email}`} disabled={t.revoke.isPending} onClick={() => revoke(i)}><X aria-hidden />Zrušit</Btn></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
        </section>
      )}
      {manage && <InviteDialog open={inviting} onClose={() => setInviting(false)} />}
      {confirmEl}
    </div>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace } = useLive();
  const { invite } = useTeamMutations(workspace.id);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const reset = () => { setEmail(''); setRole('member'); setError(''); setFields({}); };
  const close = () => { if (invite.isPending) return; reset(); onClose(); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    invite.mutate({ email, role }, {
      onSuccess: i => { toast.success(sentNote(i.email)); reset(); onClose(); },
      onError: err => { setError(message(err)); setFields(err instanceof ApiFailure ? err.fields ?? {} : {}); },
    });
  };
  return (
    <Modal open={open} onClose={close} title="Pozvat člena" desc={`Pozvaný dostane e-mail s odkazem, kterým si založí účet a připojí se k prostoru ${workspace.name}.`}>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={invite.isPending} className="contents">
          <div className="stack">
            <Field label="E-mail" hint={fields.email}><input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); setFields({}); }} placeholder="jana@firma.cz" aria-invalid={!!fields.email || undefined} autoComplete="off" autoFocus required /></Field>
            <Field label="Role"><Pick label="Role" className="full" value={role} onChange={r => setRole(r as WorkspaceRole)} options={ROLES} /></Field>
            <p className="small muted">{role === 'member' ? 'Člen týmu pracuje s kontakty, nemůže je mazat ani spravovat tým.' : 'Správce prostoru může mazat kontakty a spravovat tým. Při prvním přihlášení si musí zapnout dvoufázové ověření.'}</p>
            <FormError>{error}</FormError>
          </div>
          <div className="form-actions"><Btn type="button" onClick={close}>Zrušit</Btn><Btn primary type="submit" aria-busy={invite.isPending}>{invite.isPending ? 'Odesílám…' : 'Poslat pozvánku'}</Btn></div>
        </fieldset>
      </form>
    </Modal>
  );
}
