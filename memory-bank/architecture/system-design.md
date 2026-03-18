# Архитектура проекта Share Proxy

## Обзор
Приложение состоит из двух основных сервисов (Admin API и Proxy) и админ-панели. Разделение на Admin Plane (управление) и Data Plane (проксирование) обеспечивает высокую производительность и гибкое масштабирование стриминга.

## Стек технологий
- **Репозиторий:** PNPM Workspaces (Monorepo)
- **Runtime:** Node.js 24
- **CI/CD:** GitHub Actions (проверки `pnpm lint` и `pnpm test:ci`)
- **Backend (Admin API & Proxy):** Fastify 5, TypeScript 5.9
- **Frontend (Админка):** Vite 8, React 19, TypeScript 5.9, CSS Modules
- **База данных:** PostgreSQL 18, Drizzle ORM 0.45
- **Аутентификация (Админка):** BetterAuth 1.5
- **Тесты:** Vitest 4, Playwright 1.58
- **Storybook:** Storybook 10 для `packages/components` и `packages/video-player`
- **Источники (Sources):** Система адаптеров
- **Env-контракт:** `SECRET`, `ADMIN_API_ORIGIN`, `ADMIN_FRONTEND_ORIGIN`, `DATABASE_URL`, `POSTGRES_DATA_DIR`, `PROXY_ORIGIN`

## Структура монорепозитория
- `apps/admin-web/` — Фронтенд админки (Vite + React 19 + CSS Modules). Управление источниками, ссылками, просмотр аналитики.
- `apps/admin-api/` — Бэкенд админки (Fastify). CRUD для ссылок, интеграция с БД и BetterAuth. Интеграция с адаптерами для навигации по файлам при создании ссылок.
- `apps/proxy/` — Высокопроизводительный стриминговый сервер (Fastify). Отвечает за отдачу контента, обработку редиректов и сбор сырой аналитики.
  - Исходники proxy больше не держатся в одном `src/app.ts`: `src/app.ts` только собирает Fastify, маршруты живут в `src/routes/*`, Jellyfin-логика в `src/jellyfin.ts`, доступ/куки в `src/auth.ts`, lookup ссылок в `src/links.ts`, viewer HTML/SSR-подготовка в `src/viewer-pages.ts`, общие типы в `src/proxy-types.ts`, а переиспользуемый LRU/TTL cache вынесен в `src/cache.ts`.
- `packages/db/` — Схема базы данных (Drizzle ORM) и миграции. Общий пакет для admin-api и proxy.
- `packages/adapters/` — Унифицированные адаптеры для различных источников контента (Jellyfin, S3, Google Drive).
- `packages/core/` — Общие утилиты, типы данных, константы.
- `packages/video-player/` — Отдельный runtime-пакет кастомного браузерного видеоплеера. Используется proxy для публичного viewer и `packages/components` для React-обертки. Пакет реализован на нативных Web Components, а не на React: отдельные custom elements отвечают за popup, settings popup, timeline и нижнюю control bar. У пакета есть собственный Storybook 10 (`pnpm storybook` внутри `packages/video-player`) для проверки full-player и отдельных player state/story сценариев без React-обёртки.
- `packages/components/` — Shared UI-библиотека React-компонентов. Содержит Storybook 10 и React-обертку `Video` поверх `packages/video-player`.

## CI Pipeline (GitHub Actions)
- **Workflow:** `.github/workflows/ci.yml`
- **Триггеры:** `push` по веткам (без tag-пушей), `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`) с `paths-ignore` для документации (`*.md`, `memory-bank/**`), `merge_group` (`checks_requested`) и ручной запуск (`workflow_dispatch`)
- **Поведение PR:** проверки пропускаются для draft PR и запускаются после перевода в `ready_for_review`.
- **Проверки (matrix):**
  - `pnpm lint` — запуск всех доступных линтеров в workspace-пакетах через root-скрипт.
  - `pnpm test:ci` — предварительная сборка внутренних пакетов `@share-proxy/core`, `@share-proxy/db`, `@share-proxy/adapters`, `@share-proxy/video-player`, затем запуск всех доступных package-тестов в workspace (без root-пакета, без Playwright e2e).
- **Runtime:** Node.js из `.nvmrc` (Node 24), pnpm `10.30.1`
- **Установка зависимостей:** `pnpm install --frozen-lockfile`
- **Браузеры для Playwright в CI:** перед `pnpm test:ci` workflow дополнительно устанавливает `chromium` и `chromium-headless-shell` через `pnpm --filter @share-proxy/video-player exec playwright install --with-deps ...`, чтобы package-local Storybook browser/screenshot tests в `packages/video-player` не падали на пустом runner cache.
- **Локальная UI-проверка player runtime:** root-скрипт `pnpm run storybook:player` проксирует запуск Storybook из `packages/video-player`, чтобы player можно было проверять отдельно от React-пакета `components`.
- **Изоляция player UI:** `packages/video-player` имеет собственный unit-test слой (Vitest + jsdom) и package-local browser regression слой (Playwright поверх package-local Storybook). Это позволяет проверять и полный player, и отдельные Web Components без поднятия proxy.
- **Visual regression для player UI:** package-local Playwright suite дополнительно использует screenshot baselines поверх package-local Storybook. Скриншоты снимаются только с deterministic stories, а не с live HLS frame, чтобы визуальные эталоны были стабильными. При этом visual stories больше не рисуют hand-made fixture markup: они монтируют реальный player runtime и переводят его в нужное состояние через настоящий UI flow, чтобы baselines валидировали живой интерфейс, а не параллельную тестовую разметку.
- **Dependency baseline после общего апдейта:** workspace синхронизирован на текущие latest-релизы по npm dist-tags; ключевые апдейты — Fastify 5.8, Drizzle ORM 0.45, BetterAuth 1.5.5, Storybook 10.2, Vitest 4.1, Shaka Player 5.0, Vite 8.0 stable.
- **Публикация контейнера Proxy:** после успешных проверок на `push` в `main` workflow публикует Docker-образ `apps/proxy/Dockerfile` в GHCR (`ghcr.io/<owner>/<repo>`) с тегами `main` и short SHA. Публикация в Docker Hub в этом workflow не выполняется.

## База данных (Drizzle + PostgreSQL)
Единственный поддерживаемый runtime-режим базы данных — полноценный PostgreSQL 18.

Важно для локальной разработки:
- `pnpm dev`, `pnpm dev:admin`, `pnpm test:ci` и package-level backend tests сначала пытаются использовать уже reachable PostgreSQL из `DATABASE_URL`; только если он недоступен, `scripts/ensure-postgres.mjs` поднимает bundled `docker compose up -d --wait postgres`.
- Postgres-контейнер использует bind mount из `POSTGRES_DATA_DIR`, чтобы локальные файлы БД хранились в предсказуемом каталоге на хосте.
- `POSTGRES_DATA_DIR` указывает прямо на каталог postgres data directory.
- Если в `POSTGRES_DATA_DIR` найден несовместимый локальный postgres cluster, `scripts/ensure-postgres.mjs` автоматически переносит его в sibling backup-каталог (`<POSTGRES_DATA_DIR>-backups/...`) и инициализирует свежий dev cluster.
- Все backend-сервисы (`admin-api`, `proxy`) и тесты используют один и тот же `DATABASE_URL`.
Основные сущности:
- **User:** Пользователи админки (BetterAuth).
- **Source:** Источники файлов (тип: Jellyfin/S3 и т.д.). Содержит авторизационные данные для адаптеров в зашифрованном виде.
- **Resource:** Конкретный файл, папка или плейлист из источника. Связан по `externalId` с сущностью источника.
- **Link:** Ссылка доступа. Содержит флаг активности и опциональную дату `expiresAt`.
- **Alias:** Привязан к ссылке. Содержит уникальную пару `slug` + `domain`. Одной ссылке можно назначить множество кастомных путей.
- **Access Rule:** Правила доступа к ссылке. В текущей v1 реализованы `public` и `password`.
  - Если у ссылки нет правил — доступа нет.
  - Если подходит хотя бы одно правило — доступ разрешен (OR-логика).
  - `public` открывает доступ всем.
  - `password` хранит salted scrypt hash в `params`; несколько password-правил для одной ссылки разрешены, и любой из паролей должен открывать доступ.
- **Analytics:** Статистика переходов (IP, Country, Timestamp, User-Agent, Caller (если авторизован)).

## Система адаптеров (packages/adapters)
Система адаптеров — это слой абстракции над различными хранилищами.
Для адаптеров отведена отдельная папка `packages/adapters` внутри монорепозитория. 
Каждый адаптер обязан реализовывать единый интерфейс (контракт), включающий в себя:
1. **Инициализация:** Принимает авторизационные данные, извлеченные из БД (API ключи, токены конфигурации).
2. **Получение структуры (Файловая Система):** Возвращает стандартизированный список папок и файлов, позволяя админке выводить дерево директорий, чтобы пользователь мог выбрать конкретное видео или папку.
3. **Чтение потока (Стриминг):** Возвращает `ReadableStream` файла по указанному пути/ID. Может принимать параметры для Range-запросов (перемотка видео) и обязан вернуть метаданные ответа (`statusCode`, `contentLength`, `contentRange`, `contentType`, `acceptRanges`) для прозрачного проксирования partial content.

**Как передаются авторизационные данные:**
- При создании/разрешении ссылки в Admin Web или Proxy, сервис извлекает из БД Source вместе с его авторизационными данными.
- Эти данные пробрасываются в нужный Адаптер, после чего вызывается метод навигации `getFiles()` или метод стриминга `getStream()`.

## Особенности Proxy Сервиса
- **Маршрутизация:** В текущей v1 публичные ссылки строятся по `link.id` без префикса: viewer `GET /:id`, unlock `POST /:id/unlock`, stream `GET /:id/stream`. Служебные маршруты proxy используют префикс `/_...` (например, `GET /_health`). Это сохраняет продуктовый вид URL и оставляет namespace для внутренних endpoint-ов.
- **Viewer URL:** Admin API возвращает канонический viewer URL, собранный из `PROXY_ORIGIN` и `link.id`.
- **Viewer UI:** Публичный viewer рендерится proxy как full-viewport embed-friendly HTML-страница, но сам browser runtime вынесен в `packages/video-player`.
  - Proxy отдает ES module runtime по служебному маршруту `GET /_video-player.js`.
  - Плеер использует Shaka Player 5 core, установленный как npm dependency и бандлящийся внутрь runtime; CDN-подключения не используются.
  - Поверх Shaka рисуется кастомный control layer (play, seek, buffered bar, hover preview, volume, quality, speed, PiP, fullscreen, keyboard shortcuts).
  - Нижний chrome строится без отдельной плашки: только легкий черный градиент, overlay-таймлайн и меню настроек над ним.
  - Меню настроек содержит вложенные разделы скорости воспроизведения и качества. Для Jellyfin viewer качество больше не переключает отдельные viewer URL: proxy отдает единый synthetic multi-variant HLS master manifest, а Shaka переключает variant track внутри одной playback session.
  - Режим качества `Auto` опирается на встроенный Shaka ABR (`SimpleAbrManager`): adaptive bitrate остается включенным, выбор ограничивается размером player/screen, а текущий активный variant показывается в UI как `Auto (<resolution>)`. Стартовая `defaultBandwidthEstimate` теперь берется из browser network hints (`navigator.connection.downlink/effectiveType`) с более агрессивным fallback, чтобы на хорошем канале viewer не застревал на низком качестве в начале playback.
  - Ручной выбор качества в Shaka выполняется через `selectVariantTrack(..., false)`, то есть без принудительной очистки буфера; уже загруженный контент доигрывается, а новое качество подхватывается плавно.
  - Hover по таймлайну показывает текущее время воспроизведения, время под курсором и, если источник поддерживает trickplay, thumbnail preview.
  - Viewer поддерживает Ambient Mode по умолчанию: фон вокруг видео окрашивается на основе содержимого ролика и особенно полезен при несовпадении aspect ratio viewer и видео.
  - Ambient pipeline живет целиком в browser runtime:
    - production-режим вообще не использует `preview/storyboard` для ambient; вместо этого runtime берет реальные кадры из `<video>` и строит ambient только из них;
    - ambient работает как очередь live-frame слоев, а не как простой swap между двумя кадрами: новый кадр добавляется каждые `X` секунд sample-time, где текущий default `X = 5`, а окно смешивания `Y` сейчас равно `10`;
    - sample-time обычно берется из точки до `Y / 2` секунд вперед, но только в пределах реально загруженного вперед буфера; если вперед загружено меньше, используется самое далекое доступное место, не выходя за buffer boundary; на паузе sample-time принудительно равен текущему кадру, без lookahead;
    - непрозрачность каждого ambient-слоя растет линейно от его реального wall-clock возраста, но обновляется дискретно раз в секунду: runtime пересчитывает target opacity по целому возрасту слоя, а сам DOM слой дотягивает это значение через `opacity 1s linear`; при возрасте `0s` слой фактически невидим, при `Y / 2` достигает `50%`, а при возрасте `Y` или больше считается полностью проявившимся;
    - одинаковые sample-time не дублируются: если новый кандидат-кадр совпадает по времени с самым новым существующим слоем, runtime просто оставляет очередь как есть;
    - резкая перемотка и play/pause не очищают ambient-очередь: старые слои остаются под новым верхним слоем, а новые кадры продолжают докидываться поверх уже накопленного стека;
    - старый слой удаляется из очереди только после того, как перед ним уже есть два более новых слоя с полной непрозрачностью; это оставляет в запасе не один, а два fully-visible frame-слоя и убирает моргание общей яркости в момент pruning.
  - Ambient больше не использует один stretched background на весь stage: runtime строит зеркальные side-panels вокруг фактического `video rect` (top/bottom или left/right в зависимости от aspect ratio mismatch) и продолжает края видео отраженным live-frame. Для top/bottom используется вертикальное отражение, для left/right — горизонтальное.
  - Деформирующее растягивание внутри side-panels сохранено намеренно: сами panel-box определяются gap до края экрана, а содержимое внутри них продолжает отраженный край видео с stretch, чтобы fill уверенно закрывал всю свободную область после blur.
  - Чтобы у границы видео и внутри blur-overlap не оставалась черная seam-полоса, внутри каждого ambient-layer дополнительно рисуется отдельный central canvas по `video rect` с зеркально дорисованными edge/corner ears на размер blur-radius; side-panels упираются в границы видео, а central fill-canvas закрывает зону под самим видео и маскирует переход после blur.
  - Размер mirrored image для side-panels задается не меньше чем `2x` соответствующего размера видео: для top/bottom берется минимум `2 * videoHeight`, для left/right — минимум `2 * videoWidth`; если gap до края экрана больше этого значения, размер увеличивается до реального gap.
  - Каждый ambient-layer состоит из 4 `<canvas>` side-panels и отдельного central `<canvas>`, а одновременно активными могут быть несколько таких слоев из ambient-очереди; это дает длинное накопительное smearing вместо резкого swap между двумя картинками.
  - Ambient-слои больше не переиспользуются как фиксированный DOM-pool: runtime честно создает новый `.spvp-ambient-layer` при enqueue нового кадра и удаляет старые DOM-узлы только во время pruning/clear. Это нужно, чтобы быстрые `play/pause` и seek не наследовали старый `opacity`/transition state и не просаживали общую яркость, особенно в режиме `Bright`.
  - Live-frame ambient делает downscaled snapshot текущего video frame через canvas и применяет его к mirrored side-panels; других ambient source/fallback branch больше нет.
  - В settings menu есть вложенный раздел `Ambient` с двумя continuous controls вместо discrete select:
    - `Ambient` slider идет от `Off` через `Bright` к `Spatial`;
    - от `Off` до `Bright` линейно растет только яркость ambient от `0%` до `100%`;
    - от `Bright` до `Spatial` яркость уже не меняется, а вместо этого линейно растет smooth edge-fade маска самого видео;
    - midpoint slider соответствует `Bright`, правый край соответствует `Spatial` с `64px` edge fade;
    - default viewer state: `Bright`.
  - На той же странице ambient settings есть отдельный `Blur` slider от `0` до текущего max blur runtime; default состояние — максимальный blur.
  - Для Jellyfin trickplay proxy парсит `tiles.m3u8` (`#EXT-X-TILES`) и отдает по API не весь sprite-sheet как один preview, а координаты конкретного tile внутри sheet; browser runtime кропает нужную миниатюру на клиенте.
  - Такой же runtime подключается в React через компонент `Video` из `packages/components`.
  - Runtime структурирован по модулям с высокой связностью и низким зацеплением:
    - `player-controller.ts` координирует общий player state и интеграцию с `<video>`/Shaka;
    - `components/popup-element.ts` — абстрактный popup-контейнер;
    - `components/settings-popup-element.ts` — вложенное меню настроек;
    - `components/timeline-element.ts` — отдельный timeline/seek control;
    - `components/control-bar-element.ts` — нижняя панель player controls;
    - `components/register.ts` — единая точка регистрации custom elements;
    - `index.ts` — тонкий публичный entrypoint с re-export API.
  - У `packages/video-player` есть package-local Storybook 10 со story на отдельные части runtime:
    - full player;
    - standalone popup;
    - settings popup;
    - timeline;
    - control bar.
  - Помимо интерактивных stories у `packages/video-player` есть отдельные deterministic visual stories для screenshot regression:
    - full player default chrome;
    - settings root popup;
    - playback speed submenu;
    - ambient submenu.
  - Visual stories не должны зависеть от play-function кликов или живого HLS-состояния; они обязаны выставлять UI в готовое состояние через setup и ставить явный ready-marker (`data-story-ready="true"`).
  - Browser regression tests против Storybook обязаны покрывать минимум:
    - `Settings -> Playback speed -> Back` без поломки высоты root popup;
    - `Settings -> Playback speed -> Close -> Reopen`;
    - tall popup scrollability и sticky header;
    - отрисовку standalone popup;
    - отрисовку standalone settings popup;
    - отрисовку standalone timeline.
  - Screenshot regression tests против Storybook обязаны покрывать минимум:
    - full player default chrome;
    - settings root popup;
    - playback speed submenu;
    - ambient submenu;
    - standalone popup;
    - standalone settings popup;
    - standalone timeline;
    - standalone control bar.
  - Рабочий процесс при падении screenshot-теста:
    1. открыть `actual` screenshot из Playwright artifacts;
    2. визуально решить, ожидаем ли новый вид;
    3. если ожидаем, обновить baseline через `pnpm --filter @share-proxy/video-player test:storybook:update`;
    4. если не ожидаем, чинить UI и baseline не обновлять.
  - Сохранение viewer-состояния делается на уровне proxy-страницы, а не на уровне общего runtime: proxy передает в плеер `persistenceKey`, который должен быть стабильным ключом публичной ссылки (`id` сейчас, в будущем `slug`/`alias` тоже допускается).
  - Настройки viewer (`ambientLevel`, `ambientBlurPx`, `debug`, `volume`, `muted`, `playbackRate`, `qualityMode`, `selectedQualityId`) хранятся в cookie `spvp_settings` с максимальным сроком жизни; записи разделяются по `persistenceKey`, а выбранное качество должно восстанавливаться после reload по стабильному ключу публичной ссылки.
  - Формат cookie `spvp_settings` строго валидируется через `zod`; если структура cookie не совпадает с ожидаемой, runtime полностью очищает cookie и начинает писать новую уже в актуальном формате. Никаких legacy-миграций между версиями runtime не выполняется.
  - Прогресс просмотра хранится отдельно в cookie `spvp_progress` как последние 10 просмотренных ссылок, тоже по `persistenceKey`; кроме секунд просмотра runtime сохраняет и последнюю известную длительность ролика, чтобы viewer мог сразу восстановить и текст времени, и положение ручки на таймлайне.
  - Обе viewer-cookie (`spvp_settings` и `spvp_progress`) читаются только после строгой `zod`-валидации всего payload; если payload невалиден целиком, runtime очищает соответствующую cookie. Частичного salvage/миграций для старого формата нет.
  - При первом рендере viewer сразу показывает сохраненное время из cookie, не дожидаясь асинхронного resume seek после загрузки manifest/stream, и использует сохраненную длительность как fallback для позиции на таймлайне до прихода `loadedmetadata`.
  - Debug overlay показывает не "выбранный следующий quality", а качество в точке текущего `playhead`: runtime ведет timeline из `mediaqualitychanged` и переключает отображаемые `size/bitrate` только когда playhead доходит до нового буфера.
  - Debug overlay больше не содержит ambient-specific controls или ambient diagnostics; он показывает только фактические `size`, `bitrate` и `fps`.
- **Стриминг:** Полный прокси-пропуск байтов из адаптера с учетом HTTP-заголовка `Range` для возможности перемотки, включая корректные `206 Partial Content` заголовки.
- **Jellyfin adaptive playback:** Proxy умеет отдавать viewer-совместимый HLS manifest (`GET /:id/manifest.m3u8`), проксировать вложенные media playlist/segments через opaque sealed route (`GET /:id/media/:token`) и публиковать trickplay preview metadata (`GET /:id/preview-tracks.json`).
  - `GET /:id/manifest.m3u8` не отдает upstream master manifest как есть: proxy динамически опрашивает Jellyfin с последовательным сужением `MaxWidth`, собирает фактически доступные variant-ы из ответов `master.m3u8` и переписывает каждый variant URI в локальный opaque media route. Таким образом quality ladder формируется из реальных upstream rendition-ов, а не из захардкоженного preset-списка.
  - `resolveLink` использует in-memory LRU cache на 100 записей с TTL 1 минута; кэш хранит как найденные ссылки, так и miss-результаты, а просроченные значения выкидываются при обращении к cache API.
  - Viewer на стороне Shaka выставляет `streaming.bufferingGoal = 60` и `bufferBehind = 60`, чтобы держать заметно более длинный буфер впереди; это best-effort цель и фактический буфер зависит от сети, размера сегментов и ограничений браузера/MSE.
  - Browser никогда не получает прямой upstream Jellyfin URL, `api_key`, `MediaSourceId` или `UserId`: manifest и preview URLs всегда переписываются в локальные proxy route-ы.
  - Trickplay preview sheets дополнительно фильтруются по origin, чтобы proxy не ходил на чужие хосты с Jellyfin token/header даже если upstream manifest вернет абсолютный внешний URL.
- **Доступ:** 
  - `public`-ссылка сразу открывает viewer и stream.
  - `password`-ссылка открывает viewer через HTML-форму пароля.
  - После успешного ввода пароля proxy выдает короткоживущую signed cookie для браузерного `<video>`.
  - Прямой stream также поддерживает `Authorization: Basic ...`; username игнорируется, password проверяется против всех `password`-правил ссылки.
- **Аналитика:** Асинхронная запись событий (просмотров) в очередь/БД для минимизации задержек ответа клиенту.
- **Опциональное кэширование (Будущее):** Возможность при получении данных от медленных источников (G-Drive) кэшировать запрошенный ресурс.
