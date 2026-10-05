# Этап 9. Библиотека противников

Цель: мастер заранее заводит противников и NPC, во время игры выбирает противника одним нажатием и по желанию показывает его портрет на столе.

## Шаги
1. **Схема.** Таблица `npc`: `id` (nanoid), `room_id`, `name`, `power` (int, nullable), `notes_gm`, `image` (имя файла), `image_w`, `image_h`, `image_bytes`, `created_at`, `updated_at`. В `game_session` добавить `opponent_npc_id` (nullable, `on delete set null`). В `table_state` добавить `npc_id`. Миграция: `npm run db:generate`.
2. **Картинки.** Вынести обработку sharp из `setSceneImage` (`server/src/domain/scenes.ts`) в `server/src/domain/media.ts` (`processImage(buf) → {file, w, h, bytes}`, удаление старого файла). Сцены переходят на неё без изменения поведения. `mediaAllowed`:
   - мастеру — картинки сцен и противников своей комнаты;
   - столу — картинка показанной сцены и портрет показанного противника;
   - игрокам — ничего.
3. **Сервер.** `server/src/domain/npc.ts` (список, создать, изменить, удалить, портрет). Маршруты `/api/gm/npcs…` под `requireGm`.
   - `POST /api/gm/session/opponent` принимает `npcId` (опционально): имя и сила копируются из NPC, `opponent_npc_id` запоминается. Ручной ввод сбрасывает `opponent_npc_id`.
   - `POST /api/gm/npcs/:id/show` и `/api/gm/table/clear-npc`.
   - После правки — `publish` в `gm` (`gm:npc.changed`) и `table:state` столу.
4. **Стол.** `projectForTable` добавляет `npc: {name, image} | null` (strictObject в `shared/src/table.ts`). Сила и заметки не читаются. `routes/Table.tsx`: портрет противника поверх сцены или вместо неё.
5. **UI мастера.**
   - Раздел «Противники» (`GmNav.tsx`, новый `routes/GmNpcs.tsx`): список, редактор (имя, сила со ступенью, заметки мастера, портрет), «Сделать противником», «Показать на столе», «Убрать со стола», «Удалить».
   - `OpponentBox.tsx`: выпадающий список из библиотеки рядом с ручным вводом.
6. **Seed и документы.**
   - `seed:dev`: противник «Тест: Тролль» с маркером `СЕКРЕТ-МАСТЕРА` в `notes_gm`.
   - `docs/test-cases/stage-9.md`, manual.md, decisions.md.

## Безопасность
- Противник целиком мастерский: игрокам — ни в одном кадре, столу — только имя и портрет и только по кнопке.
- Поле `notes_gm`: в DTO мастера `notes`, в DTO стола его нет.
