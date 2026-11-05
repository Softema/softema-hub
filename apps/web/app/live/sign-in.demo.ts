/** Demo builds have no authentication at all; this stub replaces the real client at build time. */
export async function signIn(_email: string, _password: string): Promise<string | null> { return 'V ukázce se nepřihlašuje.'; }
