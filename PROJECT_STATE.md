# PROJECT_STATE

| Дата | Этап | Готово | В работе | Следующее | Решения | Блокеры |
|------|------|--------|----------|-----------|---------|---------|
| 2026-09-14 | Слой данных готов | модели Event/Task/TaskDependency/Resource/Assignment; схемы Create/Update/Response; Alembic-миграция 04fe52f10e32 с ENUM event_status/dependency_type/resource_type, индексами на FK и CASCADE delete; миграция применена к PostgreSQL 16 (\dt: 5 таблиц + alembic_version; pg_type: 3 ENUM; смоук-вставка с откатом — PASS) | — | REST API CRUD + алгоритмическое ядро Kahn/CPM/RCPSP | PostgreSQL 16, UUID через встроенный gen_random_uuid() (без pgcrypto); + str-миксин enum-ов (label==value) и values_callable в SAEnum — иначе CREATE TYPE получает имена ('DRAFT') при server_default='draft'; + составной PK у task_dependencies; CheckConstraint на самозависимость и положительные значения; ENUM native в PostgreSQL | — |
