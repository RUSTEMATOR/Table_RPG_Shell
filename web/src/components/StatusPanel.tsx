import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { cn } from '../lib/cn.ts';
import { Button, Card, CardTitle } from '../ui/index.ts';

interface Status {
  build: string;
  env: string;
  uptimeSec: number;
  memoryMb: number;
  dbBytes: number;
  mediaBytes: number;
  lastBackup: { at: number; bytes: number } | null;
  ddns: { at: number; ip?: string; changed?: boolean } | null;
  cloudflareIpsUpdatedAt: number | null;
  nginx: { ok: boolean; output: string } | null;
  jev: boolean;
  claude: boolean;
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} МБ`;
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} ч назад` : `${Math.round(h / 24)} дн назад`;
};
const uptime = (s: number) => (s < 3600 ? `${Math.round(s / 60)} мин` : s < 172800 ? `${Math.round(s / 3600)} ч` : `${Math.round(s / 86400)} дн`);

export function StatusPanel() {
  const [s, setS] = useState<Status | null>(null);
  const load = useCallback(async () => {
    const r = await api<Status>('GET', '/api/gm/status');
    if (r.ok) setS(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!s) return null;
  const backupOld = !s.lastBackup || Date.now() - s.lastBackup.at > 26 * 3600 * 1000;
  const rows: [string, string, boolean?][] = [
    ['Версия', `${s.build} (${s.env})`],
    ['Работает', uptime(s.uptimeSec)],
    ['Память', `${s.memoryMb} МБ`],
    ['База', mb(s.dbBytes)],
    ['Картинки сцен', mb(s.mediaBytes)],
    ['Последний бэкап', s.lastBackup ? `${ago(s.lastBackup.at)}, ${mb(s.lastBackup.bytes)}` : 'не было', backupOld],
    ['nginx -t', s.nginx ? (s.nginx.ok ? 'в порядке' : 'ОШИБКА') : 'не проверяется (NGINX_BIN не задан)', s.nginx ? !s.nginx.ok : false],
    ['IP Cloudflare', s.cloudflareIpsUpdatedAt ? `обновлены ${ago(s.cloudflareIpsUpdatedAt)}` : 'нет данных'],
    ['DDNS', s.ddns ? `${s.ddns.ip ?? ''} · ${ago(s.ddns.at)}` : 'нет данных'],
    ['Jev', s.jev ? 'ключ задан' : 'ключа нет'],
    ['Claude API', s.claude ? 'ключ задан' : 'ключа нет'],
  ];
  return (
    <Card>
      <div className="flex items-center gap-3">
        <CardTitle className="grow">Состояние</CardTitle>
        <Button variant="ghost" size="sm" onClick={load}>
          Обновить
        </Button>
      </div>
      <dl className="m-0 grid gap-x-6 @lg/main:grid-cols-[auto_1fr]">
        {rows.map(([k, v, bad]) => (
          <div key={k} className="contents">
            <dt className="pt-2 font-ui text-[13.6px] text-muted">{k}</dt>
            <dd className={cn('m-0 border-b border-solid border-border pb-2 @lg/main:pt-2', bad && 'font-semibold text-danger')}>{v}</dd>
          </div>
        ))}
      </dl>
      {s.nginx && !s.nginx.ok && <pre className="small prewrap m-0">{s.nginx.output}</pre>}
    </Card>
  );
}
