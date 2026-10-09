import { z } from 'zod';

// Оболочки (этап 38) — общий список для клиента и сервера; открываемые оболочки (этап 51).

export const SHELLS = [
  'book',
  'chronicle',
  'fresco',
  'ink',
  'manga',
  'novel',
  'comic',
  'deco',
  'cyber',
  'console',
  'brass',
  'terminal',
  'pda',
  'dossier',
  'pixel',
  'document',
] as const;
export type Shell = (typeof SHELLS)[number];
export const ShellSchema = z.enum(SHELLS);

export const SHELL_LABELS: Record<Shell, string> = {
  book: 'Книга',
  chronicle: 'Летопись',
  fresco: 'Фреска',
  ink: 'Тушь',
  manga: 'Манга',
  novel: 'Визуальная новелла',
  comic: 'Комикс',
  deco: 'Ар-деко',
  cyber: 'Киберинтерфейс',
  console: 'Бортовая консоль',
  brass: 'Латунный прибор',
  terminal: 'Терминал',
  pda: 'Полевой КПК',
  dossier: 'Досье',
  pixel: 'Пиксель',
  document: 'Документ',
};

/** Сколько вех даёт одно открытие. */
export const SHELL_RATES = { moments: 2, quizzes: 1, beasts: 3, sessions: 3 } as const;

export const ShellsPlayerSchema = z.strictObject({
  /** Открытые игроком (кроме свободных: «Книга» и оболочка темы персонажа — их знает клиент). */
  picked: z.array(ShellSchema),
  available: z.number().int().min(0),
  earned: z.strictObject({ moments: z.number().int(), quizzes: z.number().int(), beasts: z.number().int(), sessions: z.number().int(), gifts: z.number().int() }),
});
export type ShellsPlayer = z.infer<typeof ShellsPlayerSchema>;
export const ShellPickSchema = z.strictObject({ shell: ShellSchema });
export const ShellGrantSchema = z.strictObject({ characterId: z.string().min(1).max(64) });
