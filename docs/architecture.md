# Архитектура EventLMS

## Обзор

EventLMS — система планирования событий, представленных как DAG (направленный ациклический граф)
задач с зависимостями, длительностями и ресурсными ограничениями. MVP строится вокруг трёх
алгоритмических ядер и их REST-обвязки.

## Слои backend

```
HTTP-запрос
   │
   ▼
api/routes/         # Роутеры FastAPI: приём/валидация на границе
   │
   ▼
services/           # Бизнес-логика: планирование, CRUD-оркестрация
   │
   ▼
models/             # SQLAlchemy ORM: таблицы, связи, UUID-ключи
   ▲
   │
core/               # config.py (Pydantic Settings), database.py (async engine, session factory)
schemas/            # Pydantic-схемы: контракт API, сериализация
alembic/            # Миграции схемы БД
```

- `core/config.py` — единственная точка чтения окружения (`Pydantic Settings`, `.env`).
- `core/database.py` — `create_async_engine` + `async_sessionmaker`; подключение к БД
  не выполняется на этапе импорта, только в рантайме по запросу.
- `main.py` — фабрика приложения: FastAPI с автогенерацией OpenAPI (`/docs`),
  CORSMiddleware (origins из конфига), подключение роутеров, `GET /health`.

## Слои frontend

```
src/main.tsx        # Точка входа: StrictMode, createRoot
src/App.tsx         # Композиция страницы
src/components/     # Переиспользуемые презентационные компоненты
src/services/       # API-клиент: fetch, типизированные вызовы, обработка ошибок
src/types/          # Общие типы (контракты API)
src/store/          # Состояние на useSyncExternalStore без внешних библиотек
```

## Алгоритмическое ядро (MVP)

| Блок | Алгоритм | Слой |
|------|----------|------|
| Валидация зависимостей | Топологическая сортировка Кана (обнаружение циклов) | `services/`, чистый Python |
| Расписание ранних сроков | CPM Forward Pass (ES/EF) | `services/`, чистый Python |
| Расписание поздних сроков и резервов | CPM Backward Pass (LS/LF, float) | `services/`, чистый Python |
| Ресурсное выравнивание | RCPSP Serial Scheduling (priority-rule, SGS) | `services/`, чистый Python |

Ядро не зависит от внешних библиотек — только стандартная библиотека Python 3.11+.

## Границы MVP (заглушки)

- **Финансы**: таблица `expenses` (сумма, категория, дата) без бухгалтерских проводок.
- **Карты**: GPS-координаты хранятся и отображаются текстом, без интерактивных карт.
- **Уведомления**: интерфейс `NotificationService` + in-memory мок-реализация.

## Инфраструктура

```
docker-compose.yml
├── postgres   postgres:16-alpine, healthcheck pg_isready, named volume
├── backend    build ./backend, depends_on postgres (service_healthy), :8000
└── frontend   build ./frontend, nginx:alpine, SPA-fallback, :5173
```

PostgreSQL 16: первичные ключи UUID — встроенная функция `gen_random_uuid()`;
расширение pgcrypto не используется.

## Стратегия тестирования

- Backend: pytest + fastapi TestClient (`tests/test_health.py`, далее — сервисы ядра).
- Frontend: vitest (план — см. `tests/README.md`).
- Интеграционно: `docker compose up --build` + проверка `/health` и открытия frontend.
