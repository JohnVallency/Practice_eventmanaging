# EventLMS

Учебно-производственная система управления событиями (Event Learning Management System).
MVP: планирование событий на DAG-графе зависимостей с расчётом критического пути и ресурсным выравниванием.

## Стек

| Слой | Технологии |
|------|-----------|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2, Alembic |
| База данных | PostgreSQL 16 (встроенный `gen_random_uuid()`, без pgcrypto) |
| Frontend | React 18+, TypeScript 5 (strict), Vite |
| Инфраструктура | Docker Compose 3.8+, backend (uvicorn), frontend (nginx) |

## Быстрый старт

```bash
docker compose up --build
```

| Сервис | URL |
|--------|-----|
| Backend API | http://localhost:8000 |
| OpenAPI / Swagger | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |
| Frontend | http://localhost:5173 |

## Структура каталогов

```
.
├── backend/
│   ├── api/routes/        # Роутеры FastAPI (health и далее)
│   ├── core/              # Конфигурация (Pydantic Settings), подключение к БД
│   ├── models/            # SQLAlchemy ORM-модели
│   ├── schemas/           # Pydantic-схемы запросов/ответов
│   ├── services/          # Бизнес-логика (DAG + Kahn, CPM, RCPSP)
│   ├── alembic/           # Миграции БД
│   ├── tests/             # Pytest (TestClient)
│   ├── Dockerfile         # Многослойный образ (builder + runtime)
│   └── requirements.txt   # Зависимости с комментариями лицензий
├── frontend/
│   ├── src/
│   │   ├── components/    # Переиспользуемые React-компоненты
│   │   ├── services/      # API-клиент (fetch)
│   │   ├── types/         # Общие TypeScript-типы
│   │   └── store/         # Лёгкое состояние (useSyncExternalStore)
│   ├── Dockerfile         # Builder (node) + runtime (nginx)
│   └── package.json       # Зависимости с указанием лицензий
├── docs/                  # Архитектурная документация
├── tests/                 # Тесты и описание стратегии тестирования
├── docker-compose.yml     # PostgreSQL 16 + backend + frontend
├── PROJECT_STATE.md       # Живой статус проекта
└── README.md
```

## Правила проекта

- **Лицензии зависимостей**: только MIT, Apache-2.0, BSD-2/3-Clause, ISC. GPL/AGPL/LGPL и проприетарные запрещены. Лицензия комментируется рядом с каждой библиотекой в `requirements.txt` / `package.json`.
- **Git**: каждый завершённый файл — отдельный коммит в формате `feat(scope): описание`.
- **MVP First**: ядро — DAG + Kahn, CPM + Backward, RCPSP Serial, REST API + PostgreSQL, React UI. Заглушки: финансы (таблица expenses без проводок), карты (текст GPS), уведомления (интерфейс + мок).
- **Код**: только полный production-ready код — без TODO, троеточий и псевдокода.

## Разработка без Docker

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev                      # http://localhost:5173
```
