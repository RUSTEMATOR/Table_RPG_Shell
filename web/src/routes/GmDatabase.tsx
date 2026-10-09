import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { Badge, Button, Card, CardTitle, Skeleton, toast } from '../ui/index.ts';

// Страница «База» (этап 59): размеры, строки по таблицам, проверка целостности, снимки, Litestream.
// Содержимого таблиц и скачивания снимков нет: в базе — записи «только для меня», которые мастер не видит.

type Db = {
  dbBytes: number;
  walBytes: number;
  journalMode: string;
  pageSize: number;
  tables: { name: string; rows: number }[];
  backups: { name: string; kind: string; at: number; bytes: number }[];
  backupDir: string;
  mirror: boolean;
  litestream: { configured: boolean; bin: boolean; snapshots: string | null; generations: string | null };
};

const mb = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);
const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const KIND: Record<string, string> = { half: 'по расписанию', daily: 'ежедневный', manual: 'вручную' };

export function GmDatabase() {
  const [d, setD] = useState<Db | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState<'check' | 'backup' | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; result: string; ms: number } | null>(null);
  const load = useCallback(async () => {
    const r = await api<Db>('GET', '/api/gm/database');
    if (r.ok) setD(r.data);
    else if (r.status === 404) setGone(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (gone)
    return (
      <Card>
        <p className="m-0 text-muted">В демо-комнате страницы «База» нет.</p>
      </Card>
    );
  if (!d) return <Skeleton className="h-64" />;
  const runCheck = async () => {
    setBusy('check');
    const r = await api<{ ok: boolean; result: string; ms: number }>('POST', '/api/gm/database/check');
    setBusy(null);
    if (r.ok) setCheck(r.data);
    else toast.error('Проверка не удалась');
  };
  const backup = async () => {
    setBusy('backup');
    const r = await api<{ ok: true; at: number; bytes: number }>('POST', '/api/gm/database/backup');
    setBusy(null);
    if (!r.ok) return toast.error(r.message ?? (r.error === 'busy' ? 'Снимок уже делается' : 'Снимок не удался'));
    toast(`Снимок сделан: ${mb(r.data.bytes)}`);
    void load();
  };
  const total = d.tables.reduce((n, t) => n + t.rows, 0);
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="grow">База</CardTitle>
          <Badge>{d.journalMode.toUpperCase()}</Badge>
        </div>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[14px]">
          <dt className="text-muted">Файл базы</dt>
          <dd className="m-0">{mb(d.dbBytes)}</dd>
          <dt className="text-muted">Журнал (WAL)</dt>
          <dd className="m-0">{mb(d.walBytes)}</dd>
          <dt className="text-muted">Строк всего</dt>
          <dd className="m-0">
            {total.toLocaleString('ru-RU')} в {d.tables.length} таблицах
          </dd>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy !== null} onClick={() => void runCheck()}>
            {busy === 'check' ? 'Проверяю…' : 'Проверить целостность'}
          </Button>
          {check && <span className={check.ok ? 'text-ok' : 'text-danger'}>{check.ok ? `В порядке (${check.ms} мс)` : `Неполадка: ${check.result}`}</span>}
        </div>
        <details>
          <summary className="cursor-pointer text-[14px] text-muted">Строки по таблицам</summary>
          <ul className="m-0 mt-2 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-0.5 p-0 font-mono text-[13px]">
            {d.tables.map((t) => (
              <li key={t.name} className="flex justify-between gap-2">
                <span className="truncate">{t.name}</span>
                <span className="text-muted tabular-nums">{t.rows.toLocaleString('ru-RU')}</span>
              </li>
            ))}
          </ul>
        </details>
        <p className="m-0 text-[13px] text-muted">Содержимого таблиц здесь нет намеренно: в базе есть личные записи игроков, которые мастер не видит.</p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="grow">Снимки</CardTitle>
          <Button variant="primary" disabled={busy !== null} onClick={() => void backup()}>
            {busy === 'backup' ? 'Делаю снимок…' : 'Сделать снимок сейчас'}
          </Button>
        </div>
        <p className="m-0 text-[13px] text-muted">
          Каталог: <code>{d.backupDir}</code>
          {d.mirror ? ' · есть зеркало (BACKUP_MIRROR)' : ' · зеркала нет'}. По расписанию — каждые 30 минут во время игры и раз в сутки; вручную хранятся 20 последних.
          Восстановление — `ops/scripts/restore.sh` на Mac mini.
        </p>
        {d.backups.length === 0 ? (
          <p className="m-0 text-muted">Снимков пока нет.</p>
        ) : (
          <ul className="m-0 grid list-none gap-0 p-0 text-[14px]">
            {d.backups.map((b) => (
              <li key={b.name} className="flex flex-wrap gap-x-3 border-b border-solid border-border py-1.5 last:border-0">
                <span className="tabular-nums">{when(b.at)}</span>
                <span className="text-muted">{KIND[b.kind] ?? b.kind}</span>
                <span className="ml-auto text-muted tabular-nums">{mb(b.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="grow">Непрерывная копия (Litestream)</CardTitle>
          <Badge tone={d.litestream.configured && d.litestream.bin ? 'ok' : 'neutral'}>{d.litestream.configured && d.litestream.bin ? 'настроена' : 'не настроена'}</Badge>
        </div>
        {d.litestream.configured && d.litestream.bin ? (
          <>
            {d.litestream.generations && <pre className="m-0 overflow-x-auto rounded-control bg-surface-2 p-2 font-mono text-[12px]">{d.litestream.generations}</pre>}
            {d.litestream.snapshots && <pre className="m-0 overflow-x-auto rounded-control bg-surface-2 p-2 font-mono text-[12px]">{d.litestream.snapshots}</pre>}
            {!d.litestream.generations && !d.litestream.snapshots && (
              <p className="m-0 text-muted">Litestream не ответил — служба запущена? (`launchctl list | grep litestream`)</p>
            )}
          </>
        ) : (
          <p className="m-0 text-[14px] text-muted">
            Litestream копирует базу на внешний диск или в облако (Backblaze B2, S3) с отставанием в секунды. Включить: `brew install litestream`, затем шаги из `docs/ops.md`,
            раздел «Litestream»; в `.env` — `LITESTREAM_CONFIG`. {d.litestream.bin ? 'Бинарник найден.' : 'Бинарник не найден.'}
          </p>
        )}
      </Card>
    </>
  );
}
