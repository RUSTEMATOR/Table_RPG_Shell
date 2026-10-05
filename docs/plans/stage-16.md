# Этап 16. Фундамент нового интерфейса и библиотека компонентов

Цель: Tailwind v4, Radix, Motion и View Transitions поверх существующих токенов и движка тем, без изменения внешнего вида; набор компонентов по дизайн-системе «Зеленогорье» (https://claude.ai/artifact/PiCs1idPADjyuNp7q1jxXY). Экраны переводятся на компоненты на этапах 18–20.

## Шаги
1. **Tailwind v4.** `@tailwindcss/vite`; `styles.css` → `styles/tokens.css` (токены, дословно) + `styles/legacy.css` (остальное, слой `legacy`); точка входа `styles/index.css`: слои, `@theme inline` на токенах приложения, `--color-*: initial`; темы (`card-theme.css`, `app-skin.css`) без слоя — сильнее утилит. Класс `.table…` → `.tv…` (иначе утилита `table` = `display:table`). Внешний вид не меняется.
2. **Маршрутизатор с данными и ленивые чанки:** `createBrowserRouter`; вход, игрок, мастер (`/gm/*` под общим макетом), стол — отдельные чанки; View Transitions у ссылок и навигации, выключены при reduced motion.
3. **Компоненты, часть 1** (`web/src/ui/`): `cn()`, Button, Card (класс `card` обязателен — на нём рамки тем), Badge, Input, Textarea, Field, Skeleton, Spinner.
4. **Компоненты, часть 2** (`radix-ui`): Dialog, Popover, Tooltip, Select, Switch, DropdownMenu, Tabs/Segmented (индикатор `layoutId`), Sheet (Dialog + Motion drag).
5. **Общие модули:** `lib/motion.ts` (пружины, LazyMotion, MotionConfig reducedMotion), `ui/Toaster` (sonner), `lib/capabilities.ts`, `lib/haptics.ts`.
6. **Витрина `/dev/ui`** (только dev): все компоненты в любой теме и день/ночь.
7. **Документы:** decisions.md, test-cases/stage-16.md.
