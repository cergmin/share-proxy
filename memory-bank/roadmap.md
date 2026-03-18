# Roadmap разработки Share Proxy

## Итерация 1: Фундамент, Монорепозиторий и Jellyfin
- **Инфраструктура:** Инициализация PNPM Workspaces монорепозитория.
- **Стек:** Настройка общих конфигураций (TypeScript, ESLint). Создание заглушек `admin-web` (Vite, React 19, CSS Modules), `admin-api` (Fastify), `proxy` (Fastify).
- **База Данных:** Проектирование и настройка `packages/db` с использованием Drizzle ORM и PostgreSQL.
  - `PGLite` полностью удален из runtime/dev-контура; локальная разработка и тесты используют PostgreSQL.
  - `pnpm dev` автоматически поднимает postgres-контейнер и хранит его файлы в каталоге из `POSTGRES_DATA_DIR`.
  - `POSTGRES_DATA_DIR` указывает прямо на postgres data directory; если найден несовместимый локальный cluster, он автоматически уезжает в sibling `*-backups` каталог, после чего инициализируется свежий dev cluster.
  - `scripts/ensure-postgres.mjs` теперь сначала пытается использовать уже reachable PostgreSQL из `DATABASE_URL`, и только если он недоступен, поднимает bundled Docker Postgres как fallback.
- **Аутентификация:** Внедрение BetterAuth в `admin-api` и `admin-web`.
- **Адаптеры:** Создание `packages/adapters` с единым интерфейсом. Разработка **Jellyfin Adapter**.
- **UX Администратора:** Добавление источника Jellyfin (ввод кредов), просмотр древовидной структуры файлов (перемещений по папкам), создание простейшей публичной ссылки.
- **Proxy Streaming:** Роутинг по ID ссылки, получение кредов из БД, инициализация Jellyfin Adapter и "прозрачный" стриминг с поддержкой `Range`-запросов.
  - Статус: реализовано для Jellyfin по маршрутам `GET /:id`, `POST /:id/unlock`, `GET /:id/stream`, со служебными endpoint-ами proxy под `/_...`.
  - В админке показывается реальный viewer URL, собранный от `PROXY_ORIGIN`.
  - Введена живая модель `access_rules`: `public` и `password`, пустой список правил означает полный запрет доступа.
  - Viewer upgraded до full-viewport embed-friendly страницы на отдельном runtime-пакете `@share-proxy/video-player`; proxy раздает его как `/_video-player.js`, а `@share-proxy/components` использует тот же runtime через React-компонент `Video` и Storybook.
  - `@share-proxy/video-player` выделен в отдельный Web Components runtime с модульной структурой: popup, settings popup, timeline и control bar оформлены как самостоятельные custom elements и имеют собственные standalone stories.
  - Для `@share-proxy/video-player` добавлен отдельный visual-regression слой поверх package-local Storybook: deterministic visual stories фиксируют full player chrome, root popup, submenu скорости, submenu ambient и standalone component stories. Эти visual stories теперь используют реальный player runtime и настоящие UI transitions, а не hand-made HTML fixtures.
  - Shaka Player больше не подключается по CDN: core ставится как npm dependency внутри `@share-proxy/video-player` и доставляется клиенту вместе с локальным runtime.
  - Для Jellyfin viewer дополнительно реализованы adaptive HLS manifest-ы, buffered timeline и trickplay preview thumbnails на hover с client-side crop конкретного tile из Jellyfin sprite-sheet.
  - Viewer получил Ambient по умолчанию: фон вокруг видео теперь строится как mirrored edge reflections вокруг реального `video rect`, используя очередь live-frame слоев с defaults `X = 5s` и `Y = 10s`; новые кадры берутся до `Y / 2` секунд вперед в пределах реально загруженного буфера, а сами mirrored side-panels сохраняют stretch и дополняются central fill-canvas с reflected edge/corner ears, чтобы blur не вскрывал черные seam-полосы. Ambient-слои создаются и удаляются как реальные DOM-узлы очереди, а не переиспользуют фиксированный pool, чтобы быстрые `play/pause` и seek не ломали итоговую яркость.
  - Меню `Ambient` переведено на два continuous sliders: основной slider идет от `Off` через `Bright` к `Spatial` и управляет сначала только яркостью ambient, а затем edge-fade маской самого видео до `64px`; отдельный `Blur` slider управляет blur amount от `0` до max. По умолчанию viewer стартует в `Bright` с максимальным blur.
  - Ambient теперь всегда строится только из реальных video frames; old debug-only ambient source/tier overrides и упрощенные fallback ветки удалены.
  - `Auto` quality теперь работает через Shaka ABR поверх synthetic multi-variant HLS master manifest, собранного из bitrate-based Jellyfin preset-ов (`6 Mbps`, `4 Mbps`, `3 Mbps`, `1.5 Mbps`, `720 kbps`, `420 kbps`); ручной quality switch происходит внутри одной playback session без очистки уже набранного буфера.
  - Browser-facing media/trickplay URL-ы дополнительно закрыты opaque proxy token-ами и локальными preview route-ами, чтобы не раскрывать Jellyfin origin, `api_key` и внутренние upstream identifiers наружу.
  - Viewer state persistence перенесен на уровень публичной proxy-страницы: settings, включая выбор качества, и progress сохраняются в cookies по стабильному ключу ссылки (`id`/`slug`), viewer сразу рисует сохраненное время и позицию таймлайна по сохраненной длительности, а debug overlay показывает фактически доигрываемое качество, а не просто выбранный следующий variant.
  - Буфер viewer увеличен до best-effort цели в ~60 секунд вперед через Shaka streaming config.
  - Для `@share-proxy/video-player` добавлены package-local unit tests (Vitest) и package-local Storybook Playwright regression tests. Отдельно покрыт сценарий `Settings -> Playback speed -> Back`, который раньше ломал высоту root popup.
  - Browser regression suite дополнительно покрывает `Settings -> Playback speed -> Close -> Reopen`, tall popup scrolling и sticky header behavior; screenshot baselines обновляются только после ручной визуальной проверки `actual` diff.
- **Качество кода:** Базовый CI (GitHub Actions) с matrix-проверками `pnpm lint` и `pnpm test:ci`, запуском на `push`/`pull_request` (с `paths-ignore` для docs-only изменений), `merge_group`, ручным стартом (`workflow_dispatch`) и пропуском проверок для draft PR.
- **Технический апдейт зависимостей:** Workspace переведен на актуальные latest-версии зависимостей по npm dist-tags, включая Fastify 5, Drizzle ORM 0.45, BetterAuth 1.5.5, Storybook 10, Vitest 4, Vite 8 stable и Shaka Player 5.

## Итерация 2: Сложный доступ и Редиректы
- **Продвинутая авторизация ссылок:**
  - Ограничение по времени (Signed URLs).
  - Защита публичных ссылок паролем.
- **Редиректы и кастомные домены:**
  - Тип ресурса "Редирект" (перенаправление на внешние URL).
  - Маршрутизация на основе `Host` хедера в Proxy (например: отдача файла при открытии `cv.mydomain.com` напрямую от корня).

## Итерация 3: Новые адаптеры, Кэширование и Аналитика
- **Расширение Источников:** Разработка **Google Drive Adapter** и **S3 Adapter**.
- **Сбор аналитики:**
  - Сбор данных по заходам в Proxy (IP, страна (по GeoIP), User-Agent).
  - Отображение графиков и таблиц в Admin Web.
- **Кэширование:** Архитектура кэширующего слоя в Proxy. Возможность локально сохранять чанки потоков (например, для Google Drive) с целью кратно ускорить отдачу видео при повторном просмотре. 

## Итерация 4: Продвинутый доступ пользователей и Плейлисты
- **OAuth для зрителей:** Возможность "закрыть" просмотр ссылки для всех, кроме конкретных email-ов через авторизацию зрителя (например, вход через Google перед просмотром видео).
- **Плейлисты и Группы файлов:**
  - Создание ссылок на "папку" из адаптера или на сборный плейлист из разных источников.
  - UI плейлиста для зрителя (выбор конкретного видео).
- **Работа с изображениями:** Проксирование картинок с нарезкой/уменьшением (генерация preview thumbnail-ов для видео или галерей).
