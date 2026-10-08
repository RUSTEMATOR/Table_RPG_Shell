import { useEffect, useState } from 'react';
import { THEMES } from '../lib/cardTheme/index.ts';
import { applySkin } from '../lib/cardTheme/skin.ts';
import { themeVariant } from '../lib/cardTheme/variant.ts';
import { nextScheme, SCHEME_LABEL, useScheme } from '../lib/colorScheme.ts';
import { haptics } from '../lib/haptics.ts';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Dot,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  Spinner,
  Switch,
  TabPanel,
  Tabs,
  Textarea,
  toast,
  Tooltip,
} from '../ui/index.ts';

// Витрина компонентов (только в dev): все компоненты в любой теме, день/ночь. Это страница для глаз, не тест.

const THEME_OPTIONS = [{ value: 'none', label: 'Без оформления (приложение)' }].concat(
  Object.entries(THEMES)
    .filter(([k]) => !k.includes('~'))
    .map(([k, t]) => ({ value: k, label: t.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
);

export function DevUi() {
  const scheme = useScheme();
  // ?theme=<id> — открыть сразу с темой (снимки витрины по всем темам)
  const [theme, setTheme] = useState(() => new URLSearchParams(location.search).get('theme') ?? 'other');
  useEffect(() => {
    applySkin(theme === 'none' ? null : themeVariant(theme, scheme));
    return () => applySkin(null);
  }, [theme, scheme]);

  const [die, setDie] = useState<'d10' | 'd20'>('d20');
  const [who, setWho] = useState<'public' | 'me'>('public');
  const [tab, setTab] = useState<'traits' | 'sheet' | 'summaries'>('traits');
  const [sw, setSw] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="screen screen-wide" style={{ maxWidth: 1100 }}>
      <header className="topbar">
        <div className="topbar-title">
          <strong>Витрина компонентов</strong>
          <span className="muted">этап 16 · только dev</span>
        </div>
        <div className="flex w-72 max-w-full">
          <Select value={theme} onValueChange={setTheme} options={THEME_OPTIONS} aria-label="Тема" />
        </div>
        <Button variant="ghost" onClick={nextScheme}>
          {SCHEME_LABEL[scheme]}
        </Button>
      </header>
      <main className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardTitle>Кнопки</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => haptics.tap()}>
              Бросить d20
            </Button>
            <Button>Сохранить</Button>
            <Button variant="ghost">Отмена</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={confirm ? 'confirm' : 'danger'} onClick={() => setConfirm(!confirm)} onBlur={() => setConfirm(false)}>
              {confirm ? 'Точно удалить?' : 'Удалить'}
            </Button>
            <Button disabled>
              <Spinner className="size-4" /> Пишу…
            </Button>
            <Button size="sm">Маленькая</Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Выбор</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Кубик"
              value={die}
              onChange={setDie}
              options={[
                { value: 'd10', label: 'd10' },
                { value: 'd20', label: 'd20' },
              ]}
            />
            <Segmented
              label="Кто видит"
              value={who}
              onChange={setWho}
              options={[
                { value: 'public', label: 'Всем' },
                { value: 'me', label: 'Мне и мастеру' },
              ]}
            />
          </div>
          <Switch checked={sw} onCheckedChange={setSw} label="Показывать игроку ступень силы" />
          <Select
            value="witcher"
            onValueChange={() => {}}
            aria-label="Оформление"
            options={[
              { value: 'auto', label: 'Авто: Сайлент Хилл' },
              { value: 'horror', label: 'Ночь · Современный хоррор', group: 'Жанры' },
              { value: 'witcher', label: 'Ведьмак', group: 'Вселенные' },
            ]}
          />
        </Card>

        <Card>
          <CardTitle>Поля</CardTitle>
          <Field label="Подпись к броску" hint="Необязательно">
            {(id, d) => <Input id={id} aria-describedby={d} placeholder="Кто или что бросает" />}
          </Field>
          <Field label="Уровень силы" error="Нужно число от 1 до 10 000">
            {(id, d) => <Input id={id} aria-describedby={d} aria-invalid defaultValue="сто" />}
          </Field>
          <Field label="Заметки мастера (никуда не уходят)">{(id) => <Textarea id={id} rows={3} defaultValue="Тролль боится огня." />}</Field>
        </Card>

        <Card>
          <CardTitle>Значки и загрузка</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>обычный</Badge>
            <Badge tone="accent">скрытый класс</Badge>
            <Badge tone="ok">сильный успех</Badge>
            <Badge tone="warn">лишь царапина</Badge>
            <Badge tone="danger">провал</Badge>
            <span className="inline-flex items-center gap-1.5 font-ui text-sm">
              Дневник <Dot />
            </span>
          </div>
          <div className="grid gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-20" />
          </div>
        </Card>

        <Card className="md:col-span-2">
          <Tabs
            label="Разделы персонажа"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'traits', label: 'Черты · 6' },
              { value: 'sheet', label: 'Лист · 0' },
              { value: 'summaries', label: 'Сводки · 2' },
            ]}
          >
            <TabPanel value="traits" className="text-muted">
              Паладин, Бурная, Порог, Местная аллергия, Стёртый, Живой аргумент.
            </TabPanel>
            <TabPanel value="sheet" className="text-muted">
              Снаряжения пока нет.
            </TabPanel>
            <TabPanel value="summaries" className="text-muted">
              Сводка для мастера и вступление для игрока.
            </TabPanel>
          </Tabs>
        </Card>

        <Card>
          <CardTitle>Всплывающее</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button>Диалог</Button>
              </DialogTrigger>
              <DialogContent title="Заметки изменились" description="Пока вы печатали, заметки сохранили с другого устройства. Что оставить?">
                <div className="flex flex-wrap gap-2">
                  <DialogClose asChild>
                    <Button variant="primary">Мою версию</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>Ту, что на сервере</Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
            <Button onClick={() => setSheet(true)}>Лист снизу</Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button>Поповер</Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 text-sm">Портрет на столе показывает только имя и картинку. Сила и заметки остаются у мастера.</PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>Ещё ▾</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => toast('Показано на столе')}>Показать на столе</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toast('Противник задан')}>Сделать противником</DropdownMenuItem>
                <DropdownMenuItem danger onSelect={() => toast.error('Не удалилось — нет связи')}>
                  Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip content="Скрытый бросок видит только мастер">
              <Button variant="ghost" size="icon" aria-label="Что такое скрытый бросок">
                ?
              </Button>
            </Tooltip>
          </div>
        </Card>

        <Card>
          <CardTitle>Уведомления</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => toast('Сохранено')}>Обычное</Button>
            <Button onClick={() => toast('Сцена показана на столе', { action: { label: 'Убрать', onClick: () => toast('Сцена убрана') } })}>С действием</Button>
            <Button variant="danger" onClick={() => toast.error('Не сохранилось — нет связи')}>
              Ошибка
            </Button>
          </div>
        </Card>
      </main>

      <Sheet open={sheet} onOpenChange={setSheet} title="Новая запись">
        <Segmented
          label="Вид записи"
          value={who}
          onChange={setWho}
          options={[
            { value: 'public', label: 'Дневник' },
            { value: 'me', label: 'Только мне' },
          ]}
        />
        <Textarea rows={4} defaultValue="В тумане у часовни кто-то повторяет моё имя." />
        <Button variant="primary" onClick={() => setSheet(false)}>
          Сохранить
        </Button>
      </Sheet>
    </div>
  );
}
