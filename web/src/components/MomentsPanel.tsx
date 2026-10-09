import { useState } from 'react';
import { MOMENT_KINDS, MOMENT_KIND_LABELS, type GmCharacterView, type MomentKind } from '@zg/shared';
import { api } from '../lib/api.ts';
import { Badge, Button, Card, CardTitle, Field, GameIcon, Input, MOMENT_ICON, Select, Textarea, toast } from '../ui/index.ts';

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Памятные моменты персонажа у мастера (этап 47): список, выдать вручную, убрать. */
export function MomentsPanel({ c, onChange }: { c: GmCharacterView; onChange: (c: GmCharacterView) => void }) {
  const [kind, setKind] = useState<MomentKind>('custom');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [noteGm, setNoteGm] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const add = async () => {
    setBusy(true);
    const r = await api<GmCharacterView>('POST', '/api/gm/moments', { characterId: c.id, kind, title, text, noteGm });
    setBusy(false);
    if (!r.ok) return toast.error('Не получилось');
    onChange(r.data);
    setTitle('');
    setText('');
    setNoteGm('');
    toast('Момент выдан, игроку ушло уведомление');
  };
  const remove = async (id: string) => {
    if (confirm !== id) return setConfirm(id);
    const r = await api<GmCharacterView>('POST', `/api/gm/moments/${encodeURIComponent(id)}/delete`);
    if (r.ok) {
      onChange(r.data);
      toast('Момент убран');
    } else toast.error('Не удалилось');
    setConfirm(null);
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle className="grow">Памятные моменты</CardTitle>
        <Badge>{c.moments.length}</Badge>
      </div>
      <p className="m-0 text-[13.6px] text-muted">
        Значки за события: игрок видит их полкой на карточке, стол объявляет при выдаче. Выдать можно и с ленты — кнопка «Момент» у броска.
      </p>
      {c.moments.length > 0 && (
        <ul className="m-0 grid list-none gap-0 p-0">
          {c.moments.map((mo) => (
            <li key={mo.id} className="flex flex-wrap items-center gap-2 border-b border-solid border-border py-2 last:border-0">
              <GameIcon name={MOMENT_ICON[mo.kind]} className="text-accent" />
              <b>{mo.title}</b>
              <span className="text-[13px] text-muted">
                {MOMENT_KIND_LABELS[mo.kind]} · {when(mo.at)}
                {mo.text ? ` · ${mo.text}` : ''}
                {mo.noteGm ? ` · заметка: ${mo.noteGm}` : ''}
              </span>
              <span className="grow" />
              <Button size="sm" variant={confirm === mo.id ? 'danger' : 'ghost'} onBlur={() => setConfirm(null)} onClick={() => void remove(mo.id)}>
                {confirm === mo.id ? 'Точно?' : 'Убрать'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 rounded-control border border-dashed border-border p-3">
        <div className="grid gap-2 @xl/char:grid-cols-[200px_minmax(0,1fr)]">
          <Field label="Вид">
            {(id) => (
              <Select
                id={id}
                value={kind}
                onValueChange={(v) => setKind(v as MomentKind)}
                options={MOMENT_KINDS.map((k) => ({
                  value: k,
                  label: (
                    <span className="inline-flex items-center gap-2">
                      <GameIcon name={MOMENT_ICON[k]} className="text-muted" />
                      {MOMENT_KIND_LABELS[k]}
                    </span>
                  ),
                }))}
              />
            )}
          </Field>
          <Field label="Заголовок (увидит игрок и стол)">
            {(id) => <Input id={id} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Спас Веру от волков" />}
          </Field>
        </div>
        <Field label="Пояснение (увидит игрок)">{(id) => <Textarea id={id} rows={2} value={text} maxLength={400} onChange={(e) => setText(e.target.value)} />}</Field>
        <Field label="Заметка мастера">{(id) => <Input id={id} value={noteGm} maxLength={1000} onChange={(e) => setNoteGm(e.target.value)} />}</Field>
        <Button className="justify-self-start" disabled={busy || !title.trim()} onClick={() => void add()}>
          Выдать момент
        </Button>
      </div>
    </Card>
  );
}
