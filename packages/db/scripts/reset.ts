// Drops all application data (fictional only). Refuses anything but a local database.
import pg from 'pg';
import { required } from './env';

const url = required('DATABASE_OWNER_URL');
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('db:reset smí běžet jen proti lokální databázi.');
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query('drop schema if exists hub cascade; drop table if exists public._prisma_migrations;');
await client.end();
console.log('Lokální data byla smazána.');
