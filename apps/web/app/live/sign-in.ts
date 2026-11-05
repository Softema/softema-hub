/** Real sign-in. The password goes only to the API over the same origin and stays in memory just for this request. */
export async function signIn(email: string, password: string): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (res.ok) return null;
    if (res.status === 401 || res.status === 400) return 'Nesprávný e-mail nebo heslo.';
    if (res.status === 429) return 'Příliš mnoho pokusů. Zkuste to prosím za chvíli.';
    return 'Přihlášení se nepodařilo. Server je dočasně nedostupný.';
  } catch { return 'Přihlášení se nepodařilo. Zkontrolujte připojení.'; }
}
