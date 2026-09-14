# PROJECT_STATE

| Дата | Этап | Готово | В работе | Следующее | Решения | Блокеры |
|------|------|--------|----------|-----------|---------|---------|
| 2026-09-14 | Бизнес-логика и API готовы | 4 CRUD-сервиса (реаллокация-гард, зависимости задач, пагинация с капом); 4 роутера, 28 маршрутов; AppError-иерархия + глобальные handlers; 29 тестов (23 юнит/смоук + 6 интеграционных живых HTTP); docker-reset/logs-скрипты; dockerignore-фикс (alembic-миграции теперь попадают в образ) | — | Алгоритмическое ядро: Kahn, CPM Forward/Backward, RCPSP Serial + pytest | + глобальные AppError-handlers вместо HTTPException в роутах; collection-роуты без trailing slash; реаллокация = coalesce-сумма против availability; pydantic-ошибки тела → 422, бизнес-400 — в сервисах; .dockerignore больше не скрывает alembic/versions/*.py | — |
