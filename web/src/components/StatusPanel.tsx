import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';

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
    <section className="card">
      <div className="row spread">
        <h2>Состояние</h2>
        <button type="button" className="btn btn-ghost" onClick={load}>
          Обновить
        </button>
      </div>
      <dl className="status">
        {rows.map(([k, v, bad]) => (
          <div key={k} className="status-row">
            <dt>{k}</dt>
            <dd className={bad ? 'error' : ''}>{v}</dd>
          </div>
        ))}
      </dl>
      {s.nginx && !s.nginx.ok && <pre className="small prewrap">{s.nginx.output}</pre>}
    </section>
  );
}
