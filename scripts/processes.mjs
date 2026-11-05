// Starts long-running children in their own process group, so stopping them also stops what pnpm spawned.
import { spawn, spawnSync } from 'node:child_process';

const windows = process.platform === 'win32';
export const start = (args, env, stdio = 'inherit') => spawn('pnpm', args, { stdio, env, shell: windows, detached: !windows });
export function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (windows) { spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); return; }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
}
