import { useEffect, useState } from 'react';
import { SHEET_KINDS, SHEET_TITLES, type GmCharacterView, type GmSheetEntry, type SheetKind } from '@zg/shared';
import { api } from '../lib/api.ts';
import { cn } from '../lib/cn.ts';
import { Badge, Button, Card, CardTitle, Input, Select, Switch, Textarea } from '../ui/index.ts';

/** Лист персонажа у мастера: снаряжение, состояния, связи. Флаг «видна игроку» и заметка мастера у каждой записи. */
export function SheetPanel({ c, onChange }: { c: GmCharacterView; onChange: (c: GmCharacterView) => void }) {
  const [kind, setKind] = useState<SheetKind>('item');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const base = `/api/gm/characters/${encodeURIComponent(c.id)}/sheet`;
  const hidden = c.sheet.filter((e) => !e.visible).length;

  const add = async () => {
    setError(null);
    const r = await api<GmCharacterView>('POST', base, { kind, title, text: '', textGm: '', visible: true });
    if (!r.ok) return setError(r.error === 'too_many' ? 'Слишком много записей' : 'Не сохранилось');
    onChange(r.data);
    setTitle('');
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle className="grow">Лист</CardTitle>
        <Badge>
          {c.sheet.length}
          {hidden ? ` · скрыто ${hidden}` : ''}
        </Badge>
      </div>
      {SHEET_KINDS.map((k) => {
        const list = c.sheet.filter((e) => e.kind === k);
        return (
          <div key={k} className="grid gap-2">
            <h3 className="m-0">{SHEET_TITLES[k]}</h3>
            {list.length === 0 && <p className="m-0 text-[13.6px] text-muted">Пусто.</p>}
            {list.map((e) => (
              <SheetItem key={e.id} e={e} base={base} onChange={onChange} />
            ))}
          </div>
        );
      })}
      <div className="grid gap-2 border-t border-solid border-border pt-3 sm:grid-cols-[200px_minmax(0,1fr)_auto]">
        <Select aria-label="Раздел" value={kind} onValueChange={(v) => setKind(v as SheetKind)} options={SHEET_KINDS.map((k) => ({ value: k, label: SHEET_TITLES[k] }))} />
        <Input
          aria-label="Название новой записи"
          value={title}
          maxLength={120}
          placeholder="Название"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && void add()}
        />
        <Button variant="primary" disabled={!title.trim()} onClick={add}>
          Добавить
        </Button>
      </div>
      {error && <p className="error small m-0">{error}</p>}
    </Card>
  );
}

function SheetItem({ e, base, onChange }: { e: GmSheetEntry; base: string; onChange: (c: GmCharacterView) => void }) {
  const [title, setTitle] = useState(e.title);
  const [text, setText] = useState(e.text);
  const [textGm, setTextGm] = useState(e.textGm);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTitle(e.title);
    setText(e.text);
    setTextGm(e.textGm);
  }, [e.title, e.text, e.textGm]);
  const dirty = title !== e.title || text !== e.text || textGm !== e.textGm;
  const url = `${base}/${encodeURIComponent(e.id)}`;

  const patch = async (body: Record<string, unknown>) => {
    setError(null);
    const r = await api<GmCharacterView>('POST', url, body);
    if (r.ok) onChange(r.data);
    else setError('Не сохранилось');
  };
  const remove = async () => {
    if (!confirmDel) return setConfirmDel(true);
    const r = await api<GmCharacterView>('POST', `${url}/delete`);
    if (r.ok) onChange(r.data);
    else setError('Не удалилось');
  };

  return (
    <div className={cn('grid gap-2 rounded-control border border-solid border-border p-3', !e.visible && 'border-dashed opacity-75')}>
      <div className="flex flex-wrap items-center gap-3">
        <Input value={title} maxLength={120} onChange={(x) => setTitle(x.target.value)} aria-label="Название" className="min-w-0 flex-1 font-semibold" />
        <Switch checked={e.visible} onCheckedChange={(v) => patch({ visible: v })} label="видна игроку" />
      </div>
      <Textarea rows={2} value={text} maxLength={2000} placeholder="Текст для игрока" aria-label="Текст для игрока" onChange={(x) => setText(x.target.value)} />
      <Textarea rows={2} value={textGm} maxLength={4000} placeholder="Заметка мастера (игрок не видит)" aria-label="Заметка мастера" onChange={(x) => setTextGm(x.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        {dirty && (
          <Button size="sm" variant="primary" disabled={!title.trim()} onClick={() => patch({ title, text, textGm })}>
            Сохранить
          </Button>
        )}
        <Button size="sm" variant={confirmDel ? 'danger' : 'ghost'} onClick={remove} onBlur={() => setConfirmDel(false)}>
          {confirmDel ? 'Точно удалить?' : 'Удалить'}
        </Button>
        {e.byPlayer && <span className="text-[13px] text-muted">последним правил игрок</span>}
      </div>
      {error && <p className="error small m-0">{error}</p>}
    </div>
  );
}
