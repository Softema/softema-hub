import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const output = mkdtempSync(join(tmpdir(), 'softema-foundation-'));
process.on('exit', () => rmSync(output, { recursive: true, force: true }));
const program = ts.createProgram(['lib/data/demo-workspace-store.ts', 'lib/server/email/resend.ts'], { outDir: output, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, target: ts.ScriptTarget.ES2022, skipLibCheck: true });
assert.equal(ts.getPreEmitDiagnostics(program).length, 0);
program.emit();
writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(import.meta.url);
const { DemoWorkspaceStore } = require(join(output, 'data/demo-workspace-store.js'));
const { createResendSender } = require(join(output, 'server/email/resend.js'));
const message = { from: 'Softema <hello@example.com>', to: 'recipient@example.com', subject: 'Test', html: '<p>Test</p>', text: 'Test', idempotencyKey: 'job-1' };

test('workspace cache separates clients and organizations, retaining edits across navigation', () => {
  const store = new DemoWorkspaceStore(() => ({ agents: [] }));
  const a = { organizationId: 'a', workspaceId: 'client' };
  const b = { organizationId: 'b', workspaceId: 'client' };
  const otherClient = { organizationId: 'a', workspaceId: 'other' };
  store.update(a, () => ({ agents: ['custom agent'] }));
  assert.deepEqual(store.get(b).agents, []);
  assert.deepEqual(store.get(otherClient).agents, []);
  assert.deepEqual(store.get(a).agents, ['custom agent']);
  assert.throws(() => store.get({ organizationId: '', workspaceId: 'client' }));
});
test('demo cannot send email even when a key exists', async () => {
  let called = false;
  const sender = createResendSender({ apiKey: 'test-only', fetcher: async () => { called = true; } });
  await assert.rejects(sender.send(message), /EMAIL_SENDING_DISABLED/);
  assert.equal(called, false);
});
test('Resend adapter requires a key, a single recipient and idempotency', async () => {
  await assert.rejects(createResendSender({ enabled: true }).send(message), /RESEND_API_KEY_MISSING/);
  const sender = createResendSender({ enabled: true, apiKey: 'test-only', fetcher: async () => { throw new Error('Must not call network'); } });
  await assert.rejects(sender.send({ ...message, to: 'one@example.com,two@example.com' }), /ONE_VALID_RECIPIENT_REQUIRED/);
  await assert.rejects(sender.send({ ...message, idempotencyKey: '' }), /INVALID_IDEMPOTENCY_KEY/);
});
test('Resend request preserves idempotency and reports accepted, not delivered', async () => {
  const sender = createResendSender({ enabled: true, apiKey: 'test-only', fetcher: async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(init.headers['Idempotency-Key'], 'job-1');
    const payload = JSON.parse(init.body);
    assert.deepEqual(payload.to, ['recipient@example.com']);
    assert.equal(payload.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    return new Response(JSON.stringify({ id: 'demo-message-id' }), { status: 200 });
  } });
  assert.deepEqual(await sender.send({ ...message, unsubscribeUrl: 'https://example.com/unsubscribe/demo' }), { provider: 'resend', messageId: 'demo-message-id', status: 'accepted' });
});
test('provider failure does not return its sensitive response body', async () => {
  const sender = createResendSender({ enabled: true, apiKey: 'test-only', fetcher: async () => new Response('private upstream details', { status: 429 }) });
  await assert.rejects(sender.send(message), { message: 'RESEND_HTTP_429' });
});
