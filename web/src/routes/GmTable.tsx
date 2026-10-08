import { useCallback, useEffect, useState } from 'react';
import type { GmScene, HintCheck } from '@zg/shared';
import { api } from '../lib/api.ts';
import { useSocketEvent } from '../lib/socket.ts';
import { AnimatePresence, m } from 'motion/react';
import { spring } from '../lib/motion.tsx';
import { cn } from '../lib/cn.ts';
import { Badge, Button, buttonVariants, Card, CardTitle, Field, Input, Textarea, toast } from '../ui/index.ts';
import { Pic } from '../components/Pic.tsx';
import { uploadImage } from '../lib/uploadImage.ts';

export function GmTable() {
  return <Scenes />;
}

type Check = { status: HintCheck['status']; others: HintCheck['others'] };

function Scenes() {
  const [list, setList] = useState<GmScene[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<GmScene[]>('GET', '/api/gm/scenes');
    if (r.ok) setList(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent('gm:scenes.changed', () => void load());

  const create = async () => {
    const r = await api<GmScene>('POST', '/api/gm/scenes', { title: 'Новая сцена', textPublic: '', textGm: '' });
    if (r.ok) setList((l) => [r.data, ...l]);
    else setError('Не создалось');
  };
  const hide = async () => {
    const r = await api('POST', '/api/gm/table/show', { sceneId: null });
    if (r.ok) toast('Сцена убрана со стола');
  };
  const anyShown = list.some((s) => s.shown);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="grow">Сцены для стола</CardTitle>
          {anyShown && (
            <Button variant="ghost" onClick={hide}>
              Убрать со стола
            </Button>
          )}
          <Button variant="primary" onClick={create}>
            Новая
          </Button>
        </div>
        <p className="m-0 text-[13.6px] text-muted">На стол уходят только название, текст для стола и картинка. Заметки мастера к сцене остаются здесь.</p>
        {error && <p className="error m-0">{error}</p>}
      </Card>
      <AnimatePresence initial={false}>
        {list.map((s) => (
          <m.div key={s.id} layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={spring.soft}>
            <SceneEditor s={s} onChange={(n) => setList((l) => l.map((x) => (x.id === n.id ? n : x)))} />
          </m.div>
        ))}
      </AnimatePresence>
    </>
  );
}

function SceneEditor({ s, onChange }: { s: GmScene; onChange: (s: GmScene) => void }) {
  const [title, setTitle] = useState(s.title);
  const [textPublic, setPublic] = useState(s.textPublic);
  const [textGm, setGm] = useState(s.textGm);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setTitle(s.title);
    setPublic(s.textPublic);
    setGm(s.textGm);
  }, [s.title, s.textPublic, s.textGm]);
  const dirty = title !== s.title || textPublic !== s.textPublic || textGm !== s.textGm;

  const saveText = async () => {
    const r = await api<GmScene>('POST', `/api/gm/scenes/${s.id}`, { title, textPublic, textGm });
    if (r.ok) onChange(r.data);
    return r.ok;
  };

  // Перед показом текст для стола проверяется стражем Jev по скрытым чертам всех персонажей.
  const show = async (force: boolean) => {
    setBusy(true);
    setMsg(null);
    if (dirty && !(await saveText())) {
      setBusy(false);
      return setMsg('Не сохранилось');
    }
    if (!force && textPublic.trim()) {
      const c = await api<Check>('POST', '/api/gm/scenes/check', { text: textPublic });
      const res: Check = c.ok ? c.data : { status: 'unavailable', others: [] };
      if (res.status === 'warn' || res.status === 'unavailable') {
        setBusy(false);
        return setCheck(res);
      }
    }
    setCheck(null);
    const r = await api('POST', '/api/gm/table/show', { sceneId: s.id });
    setBusy(false);
    if (r.ok) toast(`«${title}» на столе`);
    else setMsg('Не показалось');
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg('Загружаю…');
    let res: Response;
    try {
      res = await uploadImage(`/api/gm/scenes/${s.id}/image`, file);
    } catch {
      setBusy(false);
      return setMsg('Нет связи');
    }
    setBusy(false);
    if (!res.ok) return setMsg('Картинка не подошла');
    onChange((await res.json()) as GmScene);
    setMsg(null);
  };

  const [confirmDel, setConfirmDel] = useState(false);
  const remove = async () => {
    if (!confirmDel) return setConfirmDel(true);
    await api('POST', `/api/gm/scenes/${s.id}/delete`);
  };

  return (
    <Card className={cn(s.shown && 'outline-2 outline-offset-[-2px] outline-accent')}>
      {s.shown && (
        <Badge tone="ok" className="justify-self-start">
          Сейчас на столе
        </Badge>
      )}
      <Field label="Название">{(id) => <Input id={id} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="font-name text-lg" />}</Field>
      <div className="grid gap-3 @2xl/main:grid-cols-2">
        <Field label="Текст для стола">{(id) => <Textarea id={id} rows={4} value={textPublic} maxLength={4000} onChange={(e) => setPublic(e.target.value)} />}</Field>
        <Field label="Заметки мастера (на стол не уходят)">{(id) => <Textarea id={id} rows={4} value={textGm} maxLength={20000} onChange={(e) => setGm(e.target.value)} />}</Field>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {s.image && (
          <figure className="m-0 grid gap-1">
            <Pic image={s.image} size="thumb" className="inline-block rounded-control" imgClassName="h-auto max-h-40 w-auto max-w-[280px] object-cover" loading="lazy" />
            <figcaption className="text-xs text-muted">
              {s.image.w}×{s.image.h}, {Math.round(s.image.bytes / 1024)} КБ
            </figcaption>
          </figure>
        )}
        <label className={cn(buttonVariants({ size: 'sm' }), busy && 'pointer-events-none opacity-50')}>
          {s.image ? 'Заменить картинку' : 'Добавить картинку'}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => show(false)}>
          {s.shown ? 'Обновить на столе' : 'Показать на столе'}
        </Button>
        {dirty && (
          <Button disabled={busy} onClick={async () => ((await saveText()) ? toast('Сцена сохранена') : setMsg('Не сохранилось'))}>
            Сохранить
          </Button>
        )}
        <Button variant={confirmDel ? 'danger' : 'ghost'} className="ml-auto" disabled={busy || s.shown} onClick={remove} onBlur={() => setConfirmDel(false)}>
          {confirmDel ? 'Точно удалить?' : 'Удалить'}
        </Button>
      </div>
      {msg && <p className="m-0 text-[13.6px] text-muted">{msg}</p>}
      {check && (
        <div className="jev-warn">
          {check.status === 'unavailable' ? (
            <p>Проверка недоступна (Jev не ответил).</p>
          ) : (
            check.others.map((o) => (
              <p key={o.traitName}>
                Текст, похоже, выдаёт скрытую черту «{o.traitName}» ({Math.round(o.probability * 100)}%).
              </p>
            ))
          )}
          <div className="flex gap-2">
            <Button onClick={() => show(true)}>Показать всё равно</Button>
            <Button variant="ghost" onClick={() => setCheck(null)}>
              Поправить
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
