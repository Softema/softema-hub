/** Database clients. `createAppClient` uses a restricted role under RLS; only tenant transactions see tenant data. */
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/client';

export { Prisma, PrismaClient };
export type TenantTx = Prisma.TransactionClient;

export function createClient(connectionString: string, max = 10) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }, { schema: 'hub' }) });
}

export interface TenantContext { userId: string; workspaceId?: string }

/**
 * Runs `fn` in one transaction with the tenant context set locally. `set_config(..., true)` ends with
 * the transaction, so nothing leaks through the connection pool, and it works behind a transaction pooler.
 */
export function withTenant<T>(db: PrismaClient, ctx: TenantContext, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => {
    await tx.$queryRaw`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.workspace_id', ${ctx.workspaceId ?? ''}, true)`;
    return fn(tx);
  });
}
