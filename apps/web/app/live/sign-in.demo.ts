/** Demo builds have no authentication at all; this stub replaces the real client at build time. */
import type { SignInResult } from './sign-in';

const DEMO = 'V ukázce se nepřihlašuje.';
export async function signIn(_email: string, _password: string): Promise<SignInResult> { return { error: DEMO }; }
export async function verifyTwoFactor(_code: string, _backup: boolean): Promise<string | null> { return DEMO; }
export async function requestPasswordReset(_email: string): Promise<string | null> { return DEMO; }
