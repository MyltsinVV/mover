# Халтурка / Side Gig

Аркада по мотивам Stack Attack: грузчик на складе уворачивается от ящиков, которые сбрасывают краны, толкает их и собирает целые ряды.

## Команды

```bash
npm install
npm run dev      # разработка
npm run build    # сборка в dist/
npm run zip      # сборка + mover.zip для загрузки на Playgama
npm run zip:gamepush   # сборка под GamePush + mover-gamepush.zip
npm run zip:web        # без площадки (itch.io, свой сайт) + mover-web.zip
```

Три сборки из одного кода. Вся связь с площадкой — в одном файле с общим интерфейсом из `src/platform-types.ts`:
Playgama — `src/platform.ts`, GamePush — `src/platform-gamepush.ts`, itch.io — `src/platform-web.ts`. Какой взять, решает `vite.config.ts` по режиму сборки.
Для GamePush в кабинете у проекта должно быть поле игрока `best` (число) — в нём хранится рекорд.

## Устройство

- `src/main.ts` — запуск, экраны (старт, пауза с «Заново» и «В меню», конец игры, реклама), управление, игровой цикл
- `src/game.ts` — состояние и правила: краны, ящики, грузчик, ряды
- `src/render.ts` — отрисовка на canvas
- `src/sprites.ts` — пиксельные спрайты строками
- `src/sound.ts` — звуки, синтезируются через Web Audio
- `src/platform.ts` — Playgama Bridge: язык, сигналы геймплея, реклама, сохранение личного рекорда
- `src/platform-gamepush.ts` — то же через GamePush SDK (проект 32617)
- `src/platform-web.ts` — без площадки: без рекламы, рекорд в памяти браузера (itch.io)
- `src/platform-types.ts` — общий интерфейс площадки
- `promo/` — обложки и иконки на английском и русском (обложки 800×800, 1080×1920, 1920×1080; иконки 1024×1024 и 512×384). Перерисовать: `node promo/render.cjs` (нужен Playwright с Chromium)
- `src/texts.ts` — тексты на русском и английском
- `src/config.ts` — размеры, скорости, палитра; `WARMUP*` — мягкий старт (первые секунды кранов меньше и реже)

В режиме разработки в консоли доступен `window.__mover`.
