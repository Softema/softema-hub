// Prints the current 2FA code of the fictional seed administrators, and the key for an authenticator app.
import { base32, seedTotpSecret, totp } from '../src/seed-auth';
import { required } from './env';

const secret = seedTotpSecret(required('SEED_USER_PASSWORD'));
const left = 30 - Math.floor(Date.now() / 1000) % 30;
console.log(`Ověřovací kód testovacích správců: ${totp(secret)} (platí ještě ${left} s)`);
console.log('Platí pro agentura@, spravce@ a cizi@softema-hub.example. Člen (clen@) dvoufázové ověření nemá.');
console.log(`Klíč pro autentizační aplikaci: ${base32(Buffer.from(secret, 'utf8'))}`);
