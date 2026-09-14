# PROJECT_STATE

| Дата | Этап | Готово | В работе | Следующее | Решения | Блокеры |
|------|------|--------|----------|-----------|---------|---------|
| 2026-09-14 | Инициализация костяка проекта | .gitignore, README.md, docs/architecture.md, tests/README.md | PROJECT_STATE.md, backend-костяк, frontend-костяк, docker-compose | Модели данных (events, tasks), алгоритмическое ядро (Kahn, CPM, RCPSP) | PostgreSQL 16, UUID через встроенный gen_random_uuid() (без pgcrypto); state на useSyncExternalStore без внешних библиотек; TS strict | Нет |
