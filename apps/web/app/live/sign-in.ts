/** Real sign-in. Passwords and codes go only to the API over the same origin and stay in memory just for the request. */
export type SignInResult = { ok: true } | { twoFactor: true } | { error: string };

const OFFLINE = 'Zkontrolujte připojení a zkuste to znovu.';
async function post(path: string, body: unknown) {
  return fetch(`/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    const res = await post('/sign-in/email', { email, password });
    if (res.ok) return (await res.json().catch(() => ({})))?.twoFactorRedirect ? { twoFactor: true } : { ok: true };
    if (res.status === 401 || res.status === 400) return { error: 'Nesprávný e-mail nebo heslo.' };
    if (res.status === 429) return { error: 'Příliš mnoho pokusů. Zkuste to prosím za chvíli.' };
    return { error: 'Přihlášení se nepodařilo. Server je dočasně nedostupný.' };
  } catch { return { error: `Přihlášení se nepodařilo. ${OFFLINE}` }; }
}

/** Second step of the sign-in: a code from the authenticator app, or one of the backup codes. */
export async function verifyTwoFactor(code: string, backup: boolean): Promise<string | null> {
  try {
    const res = await post(backup ? '/two-factor/verify-backup-code' : '/two-factor/verify-totp', { code: code.replace(/\s/g, '') });
    if (res.ok) return null;
    if (res.status === 429) return 'Příliš mnoho pokusů. Zkuste to prosím za chvíli.';
    const body = await res.json().catch(() => null) as { code?: string } | null;
    if (body?.code === 'INVALID_TWO_FACTOR_COOKIE') return 'Ověření vypršelo. Přihlaste se prosím znovu.';
    if (body?.code === 'ACCOUNT_TEMPORARILY_LOCKED') return 'Účet je kvůli opakovaným chybným kódům na 15 minut zamčený.';
    if (body?.code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE') return 'Příliš mnoho chybných kódů. Přihlaste se prosím znovu.';
    return backup ? 'Záložní kód není platný nebo už byl použit.' : 'Kód není platný. Zadejte aktuální kód z aplikace.';
  } catch { return `Ověření se nepodařilo. ${OFFLINE}`; }
}

/** The answer is the same whether an account exists or not. */
export async function requestPasswordReset(email: string): Promise<string | null> {
  try {
    const res = await post('/request-password-reset', { email });
    if (res.ok) return null;
    if (res.status === 429) return 'Příliš mnoho žádostí. Zkuste to prosím později.';
    if (res.status === 400) return 'Zadejte platný e-mail.';
    return 'Žádost se nepodařilo odeslat. Server je dočasně nedostupný.';
  } catch { return `Žádost se nepodařilo odeslat. ${OFFLINE}`; }
}
