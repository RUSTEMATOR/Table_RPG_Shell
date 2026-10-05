// DDNS: если внешний IP сменился, обновить A-запись в Cloudflare (запись остаётся проксируемой).
// Нужны в env-файле: CF_API_TOKEN (права только Zone.DNS:Edit на одну зону), CF_ZONE_ID, CF_RECORD_NAME.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const envFile = process.env.ZG_ENV_FILE ?? join(homedir(), '.config/zelenogorye/.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const { CF_API_TOKEN, CF_ZONE_ID, CF_RECORD_NAME } = process.env;
const root = process.env.ZG_ROOT ?? join(homedir(), 'srv/zelenogorye');
const stateDir = join(root, 'data/ops-state');
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

if (!CF_API_TOKEN || !CF_ZONE_ID || !CF_RECORD_NAME) {
  console.log(`[${stamp()}] DDNS: не заданы CF_API_TOKEN / CF_ZONE_ID / CF_RECORD_NAME — пропуск`);
  process.exit(0);
}

const api = async (path, init = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { authorization: `Bearer ${CF_API_TOKEN}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`Cloudflare API: ${JSON.stringify(j.errors)}`);
  return j.result;
};

// Внешний адрес глазами Cloudflare.
const trace = await (await fetch('https://cloudflare.com/cdn-cgi/trace', { signal: AbortSignal.timeout(10000) })).text();
const ip = /^ip=(.+)$/m.exec(trace)?.[1]?.trim();
if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw new Error(`Не удалось узнать внешний IPv4: ${ip}`);

const [rec] = await api(`/zones/${CF_ZONE_ID}/dns_records?type=A&name=${encodeURIComponent(CF_RECORD_NAME)}`);
if (!rec) throw new Error(`Нет A-записи ${CF_RECORD_NAME}`);
let changed = false;
if (rec.content !== ip) {
  await api(`/zones/${CF_ZONE_ID}/dns_records/${rec.id}`, { method: 'PATCH', body: JSON.stringify({ content: ip, proxied: true }) });
  changed = true;
  console.log(`[${stamp()}] DDNS: ${CF_RECORD_NAME} ${rec.content} → ${ip}`);
}
mkdirSync(stateDir, { recursive: true });
writeFileSync(join(stateDir, 'ddns.json'), JSON.stringify({ at: Date.now(), ip, changed }));
