// npm run build: один BUILD_ID на сервер и клиент, чтобы sync:hello ловил смену версии.
import { execSync, spawnSync } from 'node:child_process';

let sha = 'nogit';
try {
  sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {}
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const BUILD_ID = `${stamp}-${sha}`;
console.log(`BUILD_ID=${BUILD_ID}`);

const env = { ...process.env, BUILD_ID, VITE_BUILD_ID: BUILD_ID };
for (const ws of ['web', 'server']) {
  const r = spawnSync('npm', ['run', 'build', '-w', ws], { stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
